# ════════════════════════════════════════════
# SignBridge — sign_recognition/model.py
# TensorFlow CNN+LSTM multi-input model
# Architecture: LSTM (landmarks) + MobileNetV2 (image)
# Output: 29 classes (A-Z + space + del + nothing)
# ════════════════════════════════════════════

import os
import numpy as np
import tensorflow as tf
from tensorflow.keras import Model, Input
from tensorflow.keras.layers import (
    LSTM, Dense, Dropout, GlobalAveragePooling2D, Concatenate, BatchNormalization
)
from tensorflow.keras.applications import MobileNetV2

# ── Constants ─────────────────────────────────
NUM_CLASSES    = 29   # A-Z (26) + space + del + nothing
LANDMARK_DIM   = 126  # 21 pts × 3 coords × 2 hands
SEQUENCE_LEN   = 30   # frames in sliding window
IMAGE_SIZE     = 224

LABEL_MAP = {i: chr(ord('A') + i) for i in range(26)}
LABEL_MAP[26] = " "
LABEL_MAP[27] = "DEL"
LABEL_MAP[28] = "NOTHING"

REVERSE_LABEL_MAP = {v: k for k, v in LABEL_MAP.items()}


def build_signbridge_model(
    num_classes: int = NUM_CLASSES,
    landmark_seq_len: int = SEQUENCE_LEN,
    landmark_dim: int = LANDMARK_DIM,
    image_size: int = IMAGE_SIZE,
    freeze_mobilenet: bool = True
) -> Model:
    """
    Build the dual-input CNN+LSTM model for sign language recognition.

    Branch 1: LSTM sequence over hand landmark vectors
    Branch 2: MobileNetV2 CNN over raw image frame

    Merged → Dense → Softmax
    """

    # ── Branch 1: LSTM over landmark sequences ──
    landmark_input = Input(
        shape=(landmark_seq_len, landmark_dim),
        name="landmark_input"
    )
    x1 = LSTM(256, return_sequences=True, name="lstm_256")(landmark_input)
    x1 = Dropout(0.3)(x1)
    x1 = LSTM(128, return_sequences=False, name="lstm_128")(x1)
    x1 = Dense(64, activation="relu", name="landmark_dense")(x1)
    x1 = BatchNormalization()(x1)

    # ── Branch 2: MobileNetV2 for image features ─
    img_input = Input(
        shape=(image_size, image_size, 3),
        name="image_input"
    )
    mobilenet = MobileNetV2(
        input_shape=(image_size, image_size, 3),
        include_top=False,
        weights="imagenet",
        pooling=None
    )
    if freeze_mobilenet:
        for layer in mobilenet.layers[:-20]:   # freeze all but last 20 layers
            layer.trainable = False

    x2 = mobilenet(img_input)
    x2 = GlobalAveragePooling2D(name="gap")(x2)
    x2 = Dense(64, activation="relu", name="img_dense")(x2)
    x2 = BatchNormalization()(x2)
    x2 = Dropout(0.3)(x2)

    # ── Merge & Classify ────────────────────────
    merged = Concatenate(name="merge")([x1, x2])
    merged = Dense(128, activation="relu", name="merged_dense")(merged)
    merged = Dropout(0.4)(merged)
    output = Dense(num_classes, activation="softmax", name="output")(merged)

    model = Model(
        inputs=[landmark_input, img_input],
        outputs=output,
        name="SignBridgeModel"
    )
    return model


def compile_model(model: Model) -> Model:
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss="categorical_crossentropy",
        metrics=["accuracy", tf.keras.metrics.TopKCategoricalAccuracy(k=3, name="top3_acc")]
    )
    return model


def load_trained_model(model_path: str) -> Model:
    """Load a previously trained model from .h5 or SavedModel path."""
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"Model not found at: {model_path}\n"
            "Please run 'python sign_recognition/train.py' to train the model first."
        )
    print(f"[SignBridge Model] Loading model from: {model_path}")
    model = tf.keras.models.load_model(model_path)
    print("[SignBridge Model] Model loaded successfully.")
    return model


if __name__ == "__main__":
    # Quick sanity check — build and summarize the model
    model = build_signbridge_model()
    compile_model(model)
    model.summary()
    print(f"\n[SignBridge Model] Total params: {model.count_params():,}")
    print(f"[SignBridge Model] Output classes: {NUM_CLASSES}")
    print(f"[SignBridge Model] Label map: {LABEL_MAP}")
