import cv2
import numpy as np

class Preprocessor:
    def __init__(self, target_size=(224, 224)):
        self.target_size = target_size

    def decode_and_resize(self, img_bytes):
        """
        Decodes raw bytes (JPEG) coming from websocket,
        resizes it for the CNN model input.
        Returns:
            bgr_frame: Full resolution frame (for MediaPipe)
            rgb_resized: 224x224 RGB image (for CNN)
        """
        # Read from bytes
        nparr = np.frombuffer(img_bytes, np.uint8)
        bgr_frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if bgr_frame is None:
            return None, None
            
        # Optional: Flip horizontally if the camera is mirrored
        bgr_frame = cv2.flip(bgr_frame, 1)

        # Resize for MobileNetV2
        resized = cv2.resize(bgr_frame, self.target_size)
        
        # Convert to RGB and scale to 0-1 or -1 to 1 depending on prep requirements
        # MobileNetV2 uses -1 to 1, we can handle it via tf.keras.applications.mobilenet_v2.preprocess_input downstream
        rgb_resized = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        
        return bgr_frame, rgb_resized
