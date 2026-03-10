# ════════════════════════════════════════════
# SignBridge — sign_recognition/preprocessor.py
# Image preprocessing pipeline for sign detection
# ════════════════════════════════════════════

import cv2
import numpy as np
from typing import Tuple


class ImagePreprocessor:
    """
    Preprocesses raw camera frames for model inference.
      - Resize to target dimensions
      - Normalization (0-1)
      - Optional augmentations for training
    """

    def __init__(self, target_size: Tuple[int, int] = (224, 224)):
        self.target_size = target_size  # (width, height)

    def preprocess(self, frame: np.ndarray) -> np.ndarray:
        """
        Preprocess a BGR frame for model input.
        Returns float32 array of shape (224, 224, 3), values 0-1.
        """
        if frame is None:
            return np.zeros((*self.target_size[::-1], 3), dtype=np.float32)

        # Convert BGR → RGB
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if len(frame.shape) == 3 else frame

        # Resize
        resized = cv2.resize(rgb, self.target_size, interpolation=cv2.INTER_LINEAR)

        # Normalize to [0, 1]
        normalized = resized.astype(np.float32) / 255.0

        return normalized

    def preprocess_batch(self, frames: list) -> np.ndarray:
        """Process a list of frames into a batch tensor."""
        return np.stack([self.preprocess(f) for f in frames], axis=0)

    # ── Training Augmentations ───────────────
    def augment(self, frame: np.ndarray) -> np.ndarray:
        """
        Apply random augmentations for training data diversity.
          - Random rotation ±15°
          - Random brightness ±20%
          - Random horizontal flip (50%)
        """
        # Random horizontal flip
        if np.random.rand() > 0.5:
            frame = cv2.flip(frame, 1)

        # Random brightness adjustment
        factor = 1.0 + np.random.uniform(-0.2, 0.2)
        hsv = cv2.cvtColor(frame, cv2.COLOR_RGB2HSV).astype(np.float32)
        hsv[:, :, 2] = np.clip(hsv[:, :, 2] * factor, 0, 255)
        frame = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)

        # Random rotation ±15°
        angle    = np.random.uniform(-15, 15)
        h, w     = frame.shape[:2]
        M        = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
        frame    = cv2.warpAffine(frame, M, (w, h), borderMode=cv2.BORDER_REFLECT)

        return frame

    def hand_roi_crop(self, frame: np.ndarray, landmarks, padding: float = 0.15) -> np.ndarray:
        """
        Crop frame to hand region of interest based on landmarks.
        Falls back to full frame if landmarks are None.
        """
        if landmarks is None:
            return frame

        h, w = frame.shape[:2]
        xs = [lm[0] for lm in landmarks]
        ys = [lm[1] for lm in landmarks]

        x_min = max(0, int((min(xs) - padding) * w))
        y_min = max(0, int((min(ys) - padding) * h))
        x_max = min(w, int((max(xs) + padding) * w))
        y_max = min(h, int((max(ys) + padding) * h))

        crop = frame[y_min:y_max, x_min:x_max]
        if crop.size == 0:
            return frame
        return crop
