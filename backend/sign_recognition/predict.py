import numpy as np
import tensorflow as tf
import os
import asyncio
from sign_recognition.mediapipe_hands import HandLandmarker
from sign_recognition.preprocessor import Preprocessor

# Define the vocabulary mapping
LABELS = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ") + ["SPACE", "DEL", "NOTHING"]
LABEL_MAP = {i: label for i, label in enumerate(LABELS)}

SEQUENCE_LENGTH = 30
LANDMARK_DIM = 126
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", 0.75))
MODEL_PATH = os.getenv("MODEL_PATH", "./models/sign_model.h5")

class UserSession:
    def __init__(self, email: str):
        self.email = email
        self.landmark_buffer = []  # Stores last 30 126-dim numpy arrays
        
    def add_landmark(self, vector: np.ndarray):
        self.landmark_buffer.append(vector)
        if len(self.landmark_buffer) > SEQUENCE_LENGTH:
            self.landmark_buffer.pop(0)
            
    def get_sequence(self):
        # Pad with zeros if less than 30 frames
        if len(self.landmark_buffer) == 0:
            return np.zeros((SEQUENCE_LENGTH, LANDMARK_DIM), dtype=np.float32)
            
        seq = np.array(self.landmark_buffer, dtype=np.float32)
        if len(seq) < SEQUENCE_LENGTH:
            padding = np.zeros((SEQUENCE_LENGTH - len(seq), LANDMARK_DIM), dtype=np.float32)
            seq = np.vstack((padding, seq))
            
        return seq

class SignRecognitionPipeline:
    def __init__(self):
        self.landmarker = HandLandmarker()
        self.preprocessor = Preprocessor()
        self.model = None
        self.sessions = {} # Dict of email -> UserSession
        self._load_model()
        
    def _load_model(self):
        try:
            # Check if model exists
            if os.path.exists(MODEL_PATH):
                self.model = tf.keras.models.load_model(MODEL_PATH)
                print(f"[SignRecognitionPipeline] Model loaded from {MODEL_PATH}")
            else:
                print(f"[SignRecognitionPipeline] Warning: Model not found at {MODEL_PATH}. Using mock prediction for demo.")
        except Exception as e:
            print(f"[SignRecognitionPipeline] Error loading model: {e}")
            
    def init_user(self, email: str):
        if email not in self.sessions:
            self.sessions[email] = UserSession(email)
            print(f"[SignRecognitionPipeline] Initialized session for {email}")
            
    def cleanup_user(self, email: str):
        if email in self.sessions:
            del self.sessions[email]
            print(f"[SignRecognitionPipeline] Cleaned up session for {email}")

    async def process_frame_async(self, email: str, img_bytes: bytes) -> dict:
        """
        Process incoming frame, update buffer, and predict conditionally.
        Uses asyncio.to_thread if heavy lifting is needed, avoiding event loop blocks.
        """
        # Run synchronous mediapipe and CV2 processing in a background thread
        result = await asyncio.to_thread(self._process_frame_sync, email, img_bytes)
        return result

    def _process_frame_sync(self, email: str, img_bytes: bytes) -> dict:
        if email not in self.sessions:
            self.init_user(email)
            
        session = self.sessions[email]
        
        # 1. Decode and Resize
        bgr_frame, rgb_resized = self.preprocessor.decode_and_resize(img_bytes)
        if bgr_frame is None:
            return None
            
        # 2. Extract Landmarks (MediaPipe)
        hands_dict = self.landmarker.extract_landmarks(bgr_frame)
        vector = hands_dict["vector"]
        
        # 3. Update Sequence Buffer
        session.add_landmark(vector)
        sequence = session.get_sequence()
        
        # Prepare for avatar response immediately
        response = {
            "landmarks": {
                "left_hand": hands_dict.get("left_hand"),
                "right_hand": hands_dict.get("right_hand")
            },
            "sign": None,
            "confidence": 0.0
        }
        
        # Check if hands are present before trying to predict to save compute
        has_hands = hands_dict.get("left_hand") is not None or hands_dict.get("right_hand") is not None
        
        if has_hands and len(session.landmark_buffer) >= 10:  # Need at least 10 frames to start guessing 
            # 4. Predict
            if self.model:
                try:
                    # MobileNetV2 preprocessing (scales pixels to [-1, 1])
                    input_img = tf.keras.applications.mobilenet_v2.preprocess_input(np.expand_dims(rgb_resized, axis=0))
                    input_seq = np.expand_dims(sequence, axis=0)
                    
                    preds = self.model.predict([input_seq, input_img], verbose=0)[0]
                    max_idx = np.argmax(preds)
                    confidence = float(preds[max_idx])
                    
                    if confidence >= CONFIDENCE_THRESHOLD:
                        predicted_label = LABEL_MAP[max_idx]
                        if predicted_label not in ["NOTHING", "DEL", "SPACE"]:
                            response["sign"] = predicted_label
                            response["confidence"] = confidence
                except Exception as e:
                    print(f"[SignRecognitionPipeline] Inference Error: {e}")
            else:
                # Mock prediction for demo purporses if no model exists
                # We just "recognize" A when hand is visible
                # In real life, train.py generates the h5 file
                import random
                if sum(vector) != 0: # If vector is not all zeros
                    response["sign"] = random.choice(["H", "E", "L", "O", "W"]) 
                    response["confidence"] = 0.9 + (random.random() * 0.1)

        return response
