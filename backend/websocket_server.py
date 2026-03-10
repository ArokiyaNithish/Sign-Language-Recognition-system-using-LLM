# ════════════════════════════════════════════
# SignBridge — websocket_server.py
# Real-time WebSocket handler for sign frames
# ML imports are lazy so server starts without
# TensorFlow/MediaPipe/NumPy installed
# ════════════════════════════════════════════

import asyncio
import base64
import json
import os
import time
from collections import defaultdict, deque
from typing import Any, Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

# ── Config ───────────────────────────────────
JWT_SECRET_KEY     = os.getenv("JWT_SECRET_KEY", "CHANGE_ME_IN_PRODUCTION_USE_256BIT_SECRET")
JWT_ALGORITHM      = "HS256"
MAX_FRAMES_PER_SEC = 20
MAX_SIGN_BUFFER    = 15   # letters before LLM phrase building

router = APIRouter()

# ── Global State (typed as Any to avoid import-time resolution) ───
sign_pipeline: Any = None
user_contexts: Dict[str, Any] = {}
user_rate_limits: Dict[str, deque] = defaultdict(lambda: deque(maxlen=MAX_FRAMES_PER_SEC))
user_sign_buffers: Dict[str, list] = defaultdict(list)

# ── Lazy Pipeline Loader ──────────────────────
def get_pipeline():
    global sign_pipeline
    if sign_pipeline is None:
        try:
            from sign_recognition.predict import SignRecognitionPipeline
            print("[SignBridge WS] Loading sign recognition pipeline...")
            sign_pipeline = SignRecognitionPipeline()
            print("[SignBridge WS] Pipeline loaded.")
        except ImportError as e:
            print(f"[SignBridge WS] ML deps not installed ({e}). Using demo pipeline.")
            sign_pipeline = _DemoPipeline()
    return sign_pipeline

# ── Lazy Context Loader ────────────────────────
def get_context(user_id: str):
    if user_id not in user_contexts:
        try:
            from llm.context_manager import ContextManager
            user_contexts[user_id] = ContextManager(max_history=30)
        except ImportError:
            user_contexts[user_id] = _DummyContext()
    return user_contexts[user_id]

# ── Demo Pipeline (runs when TF/MediaPipe not installed) ─────────
class _DemoPipeline:
    def predict(self, frame, user_id: str = "default"):
        import random
        sign = random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        confidence = round(random.uniform(0.76, 0.98), 4)
        return {"sign": sign, "confidence": confidence, "raw": sign, "landmarks": {}}

class _DummyContext:
    def get_context(self): return ""
    def add_message(self, role, text): pass

# ── Auth Validation ───────────────────────────
def validate_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return str(payload.get("sub"))
    except JWTError:
        return None

# ── Rate Limiting ─────────────────────────────
def is_rate_limited(user_id: str) -> bool:
    now = time.time()
    bucket = user_rate_limits[user_id]
    while bucket and now - bucket[0] > 1.0:
        bucket.popleft()
    if len(bucket) >= MAX_FRAMES_PER_SEC:
        return True
    bucket.append(now)
    return False

# ── Frame Decoder ─────────────────────────────
def decode_frame(b64_data: str):
    try:
        import numpy as np
        import cv2
        img_bytes = base64.b64decode(b64_data)
        np_arr    = np.frombuffer(img_bytes, np.uint8)
        frame     = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        return frame
    except ImportError:
        return b"FRAME"   # demo sentinel when cv2/numpy not installed
    except Exception as e:
        print(f"[SignBridge WS] Frame decode error: {e}")
        return None

# ── WebSocket Endpoint ────────────────────────
@router.websocket("/ws/sign-recognition")
async def sign_recognition_ws(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Token required.")
        return

    user_id = validate_token(token)
    if not user_id:
        await websocket.close(code=4003, reason="Invalid or expired token.")
        return

    await websocket.accept()
    print(f"[SignBridge WS] Connected: user_id={user_id}")

    pipeline = get_pipeline()
    context  = get_context(user_id)

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            if msg.get("type") != "frame":
                continue

            if is_rate_limited(user_id):
                await websocket.send_json({
                    "type":    "warning",
                    "message": "Rate limit: max 20 frames/sec"
                })
                continue

            b64_data  = msg.get("data", "")
            timestamp = msg.get("timestamp", int(time.time() * 1000))

            frame = await asyncio.get_event_loop().run_in_executor(
                None, decode_frame, b64_data
            )
            if frame is None:
                continue

            # Run inference
            result = await asyncio.get_event_loop().run_in_executor(
                None, pipeline.predict, frame, user_id
            )

            if result is None:
                continue

            confidence = result.get("confidence", 0)
            threshold  = float(os.getenv("CONFIDENCE_THRESHOLD", "0.75"))
            if confidence < threshold:
                continue

            sign      = result["sign"]
            landmarks = result.get("landmarks", {})

            user_sign_buffers[user_id].append(sign)

            # Immediate recognition response
            await websocket.send_json({
                "type":       "recognition",
                "text":       sign,
                "confidence": round(confidence, 4),
                "raw_sign":   result.get("raw", sign),
                "landmarks":  landmarks,
                "timestamp":  timestamp
            })

            # Avatar landmark data
            if landmarks:
                await websocket.send_json({
                    "type":      "avatar_sign",
                    "sign":      sign,
                    "landmarks": landmarks
                })

            # Phrase accumulation
            buf = user_sign_buffers[user_id]
            if len(buf) >= MAX_SIGN_BUFFER or (len(buf) > 2 and sign == " "):
                phrase = await _build_phrase(user_id, buf.copy(), context)
                if phrase:
                    await websocket.send_json({
                        "type": "phrase_ready",
                        "text": phrase
                    })
                user_sign_buffers[user_id] = []

    except WebSocketDisconnect:
        print(f"[SignBridge WS] Disconnected: user_id={user_id}")
    except Exception as e:
        print(f"[SignBridge WS] Error for user {user_id}: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        user_sign_buffers.pop(user_id, None)
        print(f"[SignBridge WS] Cleaned up: user_id={user_id}")


async def _build_phrase(user_id: str, signs: list, context) -> str:
    try:
        from llm.gemini_client import signs_to_sentence
        phrase = await signs_to_sentence(signs, context.get_context())
        if phrase:
            context.add_message("assistant", phrase)
        return phrase
    except ImportError:
        return " ".join(signs)  # fallback when google-generativeai not installed
    except Exception as e:
        print(f"[SignBridge WS] Phrase building error: {e}")
        return " ".join(signs)
