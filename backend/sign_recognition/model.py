import tensorflow as tf
from tensorflow.keras.layers import Input, Dense, LSTM, Concatenate, GlobalAveragePooling2D, Dropout
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.models import Model

# Based on User specs:
# Input 1: Landmark sequence (last 30 frames) shape=(30, 126)  
# Input 2: Raw image frame shape=(224, 224, 3)

NUM_CLASSES = 29 # 26 Letters + Space + Del + Nothing
SEQUENCE_LENGTH = 30
LANDMARK_DIM = 126
IMAGE_SHAPE = (224, 224, 3)

def build_sign_model(num_classes=NUM_CLASSES):
    # Branch 1: LSTM for landmark temporal sequence
    lstm_input = Input(shape=(SEQUENCE_LENGTH, LANDMARK_DIM), name="landmark_sequence_input")
    x1 = LSTM(256, return_sequences=True)(lstm_input)
    x1 = Dropout(0.2)(x1)
    x1 = LSTM(128)(x1)
    x1 = Dropout(0.2)(x1)
    x1 = Dense(64, activation='relu')(x1)

    # Branch 2: MobileNetV2 for image features  
    img_input = Input(shape=IMAGE_SHAPE, name="raw_image_input")
    mobilenet = MobileNetV2(include_top=False, weights='imagenet', input_tensor=img_input)
    
    # Freeze the base model layers
    for layer in mobilenet.layers:
        layer.trainable = False
        
    x2 = GlobalAveragePooling2D()(mobilenet.output)
    x2 = Dense(64, activation='relu')(x2)
    x2 = Dropout(0.2)(x2)

    # Merge branches
    merged = Concatenate()([x1, x2])
    x3 = Dense(128, activation='relu')(merged)
    x3 = Dropout(0.3)(x3)
    output = Dense(num_classes, activation='softmax', name="label_output")(x3)

    model = Model(inputs=[lstm_input, img_input], outputs=output)
    return model

if __name__ == "__main__":
    model = build_sign_model()
    model.summary()
    print("Model architecture built successfully!")
