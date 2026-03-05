import asyncio
import json
import base64
import time
from fastapi import WebSocket, WebSocketDisconnect, Depends
from jose import jwt, JWTError

import os
from dotenv import load_dotenv
load_dotenv()

# We need the sign recognition pipeline instance
# We will lazily load this to avoid long startup times before WS binds
from sign_recognition.predict import SignRecognitionPipeline

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7")
ALGORITHM = "HS256"

# Load the single pipeline instance
recognition_pipeline = None

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, email: str):
        await websocket.accept()
        self.active_connections[email] = websocket
        
        # Init user buffer in pipeline
        if recognition_pipeline:
            recognition_pipeline.init_user(email)

    def disconnect(self, email: str):
        if email in self.active_connections:
            del self.active_connections[email]
        if recognition_pipeline:
            recognition_pipeline.cleanup_user(email)

    async def send_personal_message(self, message: dict, email: str):
        if email in self.active_connections:
            await self.active_connections[email].send_json(message)

manager = ConnectionManager()

async def ws_get_current_user(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
        return email
    except JWTError:
        return None

async def sign_websocket_endpoint(websocket: WebSocket, token: str):
    email = await ws_get_current_user(token)
    if not email:
        await websocket.close(code=1008)
        return
        
    global recognition_pipeline
    if not recognition_pipeline:
        print("[WS Server] Initializing Sign Recognition Pipeline...")
        recognition_pipeline = SignRecognitionPipeline()
        print("[WS Server] Pipeline Ready")

    await manager.connect(websocket, email)
    
    # Track Last Recognition to avoid spamming the same sign if user holds pose
    last_sent_sign = ""
    last_sent_time = 0

    try:
        while True:
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                msg_type = message.get("type")
                
                if msg_type == "ping":
                    await websocket.send_json({"type": "pong", "timestamp": message.get("timestamp")})
                    continue
                    
                if msg_type == "frame":
                    frame_b64 = message.get("data")
                    if not frame_b64: continue
                    
                    # Convert Base64 back to bytes
                    img_bytes = base64.b64decode(frame_b64)
                    
                    # Offload intense computation to event loop / thread pool via pipeline
                    # Actually pipeline.predict will handle processing efficiently
                    result = await recognition_pipeline.process_frame_async(email, img_bytes)
                    
                    if result:
                        # 1. Provide Avatar Hand Landmarks continuously (always)
                        if "landmarks" in result and result["landmarks"]:
                            await manager.send_personal_message({
                                "type": "avatar_sign",
                                "landmarks": result["landmarks"]
                            }, email)
                            
                        # 2. Provide Sign Recognition if confidence is high and novel
                        if "sign" in result and result["sign"]:
                            sign = result["sign"]
                            conf = result["confidence"]
                            
                            # Only send if confidence > threshold (e.g 75%) and distinct from recently sent
                            now = time.time()
                            if conf > 0.75 and (sign != last_sent_sign or (now - last_sent_time) > 2.0):
                                
                                # Process through LLM if needed (context building)
                                # For MVP real-time we just send the sign. Building sentences is done in LLM client.
                                # Let's format nicely
                                display_text = f"Signed: {sign}"
                                
                                await manager.send_personal_message({
                                    "type": "recognition",
                                    "text": display_text,
                                    "raw_sign": sign,
                                    "confidence": float(conf)
                                }, email)
                                
                                last_sent_sign = sign
                                last_sent_time = now

            except json.JSONDecodeError:
                pass
            except Exception as e:
                print(f"[WS Server] Frame processing error: {e}")
                
    except WebSocketDisconnect:
        manager.disconnect(email)
    except Exception as e:
        print(f"[WS Server] Disconnected with error: {e}")
        manager.disconnect(email)
