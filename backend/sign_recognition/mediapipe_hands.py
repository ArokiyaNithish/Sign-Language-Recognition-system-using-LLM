import cv2
import mediapipe as mp
import numpy as np

class HandLandmarker:
    def __init__(self, max_num_hands=2, min_detection_confidence=0.7):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False, # We are running on video sequences
            max_num_hands=max_num_hands,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=0.5
        )

    def extract_landmarks(self, frame_bgr):
        """
        Process BGR frame (OpenCV default) and extract normalized landmarks.
        Returns: Dict containing 'left_hand' and 'right_hand' arrays,
                 and a raw flattened 126-dim vector for model input.
        """
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        result = self.hands.process(frame_rgb)
        
        hands_dict = {
            "left_hand": None,
            "right_hand": None,
            "vector": np.zeros(126, dtype=np.float32) # 21pts * 3coords * 2hands = 126
        }

        if not result.multi_hand_landmarks:
            return hands_dict

        for idx, hand_landmarks in enumerate(result.multi_hand_landmarks):
            # Check handedness (Left vs Right)
            handedness = result.multi_handedness[idx].classification[0].label # "Left" or "Right"
            # Note: MediaPipe's "Left" and "Right" are inherently flipped if not mirrored
            # We assume front-facing camera without explicit mirroring.
            key = "left_hand" if handedness == "Left" else "right_hand"
            
            coords = []
            
            # Extract relative to wrist to make it scale invariant? 
            # The prompt asks for normalized relative to wrist, but MediaPipe coordinates
            # are already normalized to frame bounds 0-1.
            # We will use raw normalized 0-1 coords for Avatar, and relative for Model
            
            wrist_x = hand_landmarks.landmark[0].x
            wrist_y = hand_landmarks.landmark[0].y
            wrist_z = hand_landmarks.landmark[0].z
            
            for lm in hand_landmarks.landmark:
                # Store absolute normalized for Avatar rendering
                coords.append([lm.x, lm.y, lm.z])
                
            hands_dict[key] = coords
            
            # Populate the 126-dim vector for LSTM Neural Net
            # Left hand occupies first 63 floats, Right hand occupies next 63 floats
            start_idx = 0 if handedness == "Left" else 63
            for i, lm in enumerate(hand_landmarks.landmark):
                # We normalize relative to the wrist for model training
                hands_dict["vector"][start_idx + (i*3)] = lm.x - wrist_x
                hands_dict["vector"][start_idx + (i*3) + 1] = lm.y - wrist_y
                hands_dict["vector"][start_idx + (i*3) + 2] = lm.z - wrist_z

        return hands_dict

    def close(self):
        self.hands.close()
