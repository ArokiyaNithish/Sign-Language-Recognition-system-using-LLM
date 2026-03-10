# ════════════════════════════════════════════
# SignBridge — sign_recognition/predict.py
# Real-time inference pipeline
# SlidingWindowBuffer + CTC-style decoding
# ════════════════════════════════════════════

import os
import cv2
import numpy as np
from collections import deque, defaultdict
from typing import Optional, Dict

from sign_recognition.model import LABEL_MAP, NUM_CLASSES, SEQUENCE_LEN, load_trained_model
from sign_recognition.mediapipe_hands import MediaPipeHandExtractor
from sign_recognition.preprocessor import ImagePreprocessor

MODEL_PATH          = os.getenv("MODEL_PATH", "./models/sign_model.h5")
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.75"))


class SlidingWindowBuffer:
    """
    Maintains a per-user rolling buffer of the last N landmark vectors.
    """
    def __init__(self, maxlen: int = SEQUENCE_LEN, feature_dim: int = 126):
        self.maxlen = maxlen
        self.dim    = feature_dim
        self.buffer: deque = deque(maxlen=maxlen)

    def push(self, vector: np.ndarray):
        self.buffer.append(vector.astype(np.float32))

    def get_sequence(self) -> np.ndarray:
        """Returns shape (SEQUENCE_LEN, 126), padded with zeros if buffer not full."""
        seq = list(self.buffer)
        while len(seq) < self.maxlen:
            seq.insert(0, np.zeros(self.dim, dtype=np.float32))
        return np.stack(seq, axis=0)  # (30, 126)

    def is_ready(self) -> bool:
        return len(self.buffer) >= max(5, self.maxlen // 3)


class CTCDecoder:
    """
    Simple CTC-style letter sequence decoder.
    Collapses repeated letters,ignores 'NOTHING'/'DEL'.
    """

    def __init__(self, collapse_repeats: bool = True):
        self.collapse_repeats = collapse_repeats
        self.history: list = []

    def push(self, letter: str, confidence: float) -> Optional[str]:
        if letter == "NOTHING":
            return None
        if letter == "DEL" and self.history:
            self.history.pop()
            return None
        if self.collapse_repeats and self.history and self.history[-1] == letter:
            return None  # suppress repeated detection of same letter
        self.history.append(letter)
        return letter

    def get_word(self) -> str:
        return "".join(self.history)

    def clear(self):
        self.history = []


class SignRecognitionPipeline:
    """
    End-to-end inference pipeline.
    Per-user sliding window buffers + shared model.
    Thread-safe for use with asyncio.run_in_executor.
    """

    def __init__(self):
        self.extractor   = MediaPipeHandExtractor()
        self.preprocessor = ImagePreprocessor()
        self.model       = None
        self.user_buffers: Dict[str, SlidingWindowBuffer] = defaultdict(SlidingWindowBuffer)
        self.user_decoders: Dict[str, CTCDecoder] = defaultdict(CTCDecoder)
        self._load_model()

    def _load_model(self):
        try:
            self.model = load_trained_model(MODEL_PATH)
            print(f"[SignBridge Predict] Model loaded from {MODEL_PATH}")
        except FileNotFoundError as e:
            print(f"[SignBridge Predict] WARNING: {e}")
            print("[SignBridge Predict] Running in demo mode (will return placeholder predictions).")
            self.model = None

    def predict(self, frame: np.ndarray, user_id: str = "default") -> Optional[Dict]:
        """
        Run one prediction on a single frame.

        Returns dict: {sign, confidence, raw, landmarks} or None
        """
        if frame is None:
            return None

        # ── 1. MediaPipe landmark extraction ──
        rgb     = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        lm_data = self.extractor.extract(rgb)
        vector  = lm_data["vector"]  # (126,)

        # ── 2. Update sliding window buffer ──
        buf = self.user_buffers[user_id]
        buf.push(vector)

        # ── 3. Preprocess image for CNN branch ──
        img = self.preprocessor.preprocess(frame)  # (224, 224, 3)

        # ── 4. Inference ─────────────────────
        if self.model is None:
            # Demo mode: simulate a prediction if hands detected
            if np.max(np.abs(vector)) > 0.01:
                demo_sign = chr(ord('A') + (int(np.sum(np.abs(vector))) % 26))
                return {
                    "sign":       demo_sign,
                    "confidence": 0.80,
                    "raw":        demo_sign,
                    "landmarks": {
                        "left_hand":  lm_data["left_hand"],
                        "right_hand": lm_data["right_hand"]
                    }
                }
            return None

        if not buf.is_ready():
            return None

        sequence = buf.get_sequence()  # (30, 126)

        # Batch dim
        lm_input  = np.expand_dims(sequence, axis=0)  # (1, 30, 126)
        img_input = np.expand_dims(img, axis=0)        # (1, 224, 224, 3)

        predictions = self.model.predict(
            [lm_input, img_input],
            verbose=0
        )[0]  # shape (29,)

        class_idx   = int(np.argmax(predictions))
        confidence  = float(predictions[class_idx])

        if confidence < CONFIDENCE_THRESHOLD:
            return None

        sign = LABEL_MAP.get(class_idx, "?")

        # CTC decode
        decoder = self.user_decoders[user_id]
        decoded = decoder.push(sign, confidence)

        return {
            "sign":       sign,
            "confidence": confidence,
            "raw":        decoded or sign,
            "landmarks": {
                "left_hand":  lm_data["left_hand"],
                "right_hand": lm_data["right_hand"]
            }
        }
