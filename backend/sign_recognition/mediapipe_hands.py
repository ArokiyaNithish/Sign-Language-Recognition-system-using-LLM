# ════════════════════════════════════════════
# SignBridge — sign_recognition/mediapipe_hands.py
# Hand landmark extraction via MediaPipe
# Returns normalized 126-dim feature vectors
# ════════════════════════════════════════════

import numpy as np
import mediapipe as mp
from typing import Optional, Dict, List, Tuple

# Initialize MediaPipe Hands
_mp_hands   = mp.solutions.hands
_mp_drawing = mp.solutions.drawing_utils

class MediaPipeHandExtractor:
    """
    Extracts 21 hand landmarks per hand using MediaPipe.
    Normalizes relative to wrist position for scale invariance.
    Returns a flat 126-dimensional feature vector:
      - 21 landmarks × 3 coords (x, y, z) × 2 hands = 126
    Missing hands are represented as zeros.
    """

    def __init__(
        self,
        max_num_hands: int = 2,
        min_detection_confidence: float = 0.7,
        min_tracking_confidence:  float = 0.6
    ):
        self.hands = _mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=max_num_hands,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence
        )
        self.max_num_hands = max_num_hands

    def extract(self, frame_rgb: np.ndarray) -> Dict:
        """
        Process a BGR/RGB frame and return landmark data.

        Returns:
            {
              "left_hand":  [[x,y,z] × 21] or None,
              "right_hand": [[x,y,z] × 21] or None,
              "vector":     np.ndarray shape (126,) — flat feature vector
            }
        """
        results = self.hands.process(frame_rgb)

        left_landmarks  = None
        right_landmarks = None

        if results.multi_hand_landmarks and results.multi_handedness:
            for hand_landmarks, handedness in zip(
                results.multi_hand_landmarks,
                results.multi_handedness
            ):
                label = handedness.classification[0].label  # "Left" or "Right"
                lm_list = self._extract_landmark_list(hand_landmarks)
                if label == "Left":
                    left_landmarks  = lm_list
                else:
                    right_landmarks = lm_list

        vector = self._build_vector(left_landmarks, right_landmarks)

        return {
            "left_hand":  left_landmarks,
            "right_hand": right_landmarks,
            "vector":     vector
        }

    def _extract_landmark_list(self, hand_landmarks) -> List[List[float]]:
        """Extract 21 [x, y, z] landmarks and normalize relative to wrist."""
        lm = hand_landmarks.landmark
        wrist = lm[0]  # landmark 0 = wrist

        normalized = []
        for point in lm:
            normalized.append([
                point.x - wrist.x,
                point.y - wrist.y,
                point.z - wrist.z
            ])

        # Scale invariance: divide by max extent
        coords = np.array(normalized)
        extent = np.max(np.abs(coords)) or 1.0
        coords /= extent

        return coords.tolist()

    def _build_vector(
        self,
        left:  Optional[List],
        right: Optional[List]
    ) -> np.ndarray:
        """Build 126-dim flat vector from left and right landmarks."""
        def to_flat(lm_list):
            if lm_list is None:
                return np.zeros(63, dtype=np.float32)  # 21 * 3
            return np.array(lm_list, dtype=np.float32).flatten()

        left_vec  = to_flat(left)
        right_vec = to_flat(right)
        return np.concatenate([left_vec, right_vec])  # 126-dim

    def close(self):
        self.hands.close()
