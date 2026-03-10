# ════════════════════════════════════════════
# SignBridge — sign_recognition/train.py
# Training script: ASL Kaggle dataset
# Dual-input CNN+LSTM model
# Run: python sign_recognition/train.py
# ════════════════════════════════════════════

import os
import sys

# Add the 'backend' root directory to the Python path
# so imports like 'sign_recognition.model' work correctly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time
import numpy as np
import cv2
import pandas as pd
from pathlib import Path
from sklearn.model_selection import train_test_split
import tensorflow as tf
from tensorflow.keras.callbacks import (
    ModelCheckpoint, EarlyStopping, ReduceLROnPlateau, TensorBoard
)
from tensorflow.keras.utils import to_categorical

from sign_recognition.model import (
    build_signbridge_model, compile_model,
    LABEL_MAP, REVERSE_LABEL_MAP, NUM_CLASSES, SEQUENCE_LEN
)
from sign_recognition.mediapipe_hands import MediaPipeHandExtractor
from sign_recognition.preprocessor import ImagePreprocessor

# ── Config ───────────────────────────────────
DATASET_DIR = os.getenv("DATASET_DIR", "./data/asl_alphabet/asl_alphabet_train")
MODEL_DIR   = os.getenv("MODEL_DIR",   "./models")
LOG_DIR     = "./logs/train"
BATCH_SIZE  = 32
EPOCHS      = 50
VAL_SPLIT   = 0.15
IMAGE_EXT   = (".jpg", ".jpeg", ".png")

os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(LOG_DIR,   exist_ok=True)


# ── Dataset Loader ────────────────────────────
def load_dataset(dataset_dir: str):
    """
    Expects folder structure:
      asl_dataset/
        A/  (images of sign 'A')
        B/  (images of sign 'B')
        ...
        Z/
        space/
        del/
        nothing/

    Returns:
      landmark_seqs: list of np.ndarray (30, 126) — landmark sequences
      images:        list of np.ndarray (224, 224, 3) — preprocessed images
      labels:        list of int — class indices
    """
    extractor    = MediaPipeHandExtractor()
    preprocessor = ImagePreprocessor()

    landmark_seqs = []
    images        = []
    labels        = []

    dataset_path = Path(dataset_dir)
    if not dataset_path.exists():
        print(f"[Train] Dataset not found at: {dataset_dir}")
        print("[Train] Please download from Kaggle:")
        print("  https://www.kaggle.com/grassknoted/asl-alphabet")
        print("  Extract to: ./data/asl_dataset/")
        sys.exit(1)

    class_dirs = sorted([d for d in dataset_path.iterdir() if d.is_dir()])
    print(f"[Train] Found {len(class_dirs)} class directories.")

    for class_dir in class_dirs:
        label_name = class_dir.name.upper().replace("SPACE", " ").replace("DELETE", "DEL")
        label_idx  = REVERSE_LABEL_MAP.get(label_name)
        if label_idx is None:
            print(f"[Train] Skipping unknown class: {class_dir.name}")
            continue

        img_paths = [
            p for p in class_dir.iterdir()
            if p.suffix.lower() in IMAGE_EXT
        ]
        print(f"[Train] Class {label_name!r}: {len(img_paths)} images")

        for img_path in img_paths:
            frame = cv2.imread(str(img_path))
            if frame is None:
                continue

            # Extract landmarks → slide into dummy 30-frame window
            rgb  = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            data = extractor.extract(rgb)
            vec  = data["vector"]  # (126,)

            # Build a synthetic sequence (same frame repeated)
            seq = np.stack([vec] * SEQUENCE_LEN, axis=0)  # (30, 126)

            # Preprocess image
            img = preprocessor.preprocess(frame)  # (224, 224, 3)

            landmark_seqs.append(seq)
            images.append(img)
            labels.append(label_idx)

    extractor.close()
    print(f"[Train] Total samples loaded: {len(labels)}")
    return (
        np.array(landmark_seqs, dtype=np.float32),
        np.array(images,        dtype=np.float32),
        np.array(labels,        dtype=np.int32)
    )


# ── Augment Batch ─────────────────────────────
def augment_batch(images: np.ndarray) -> np.ndarray:
    preprocessor = ImagePreprocessor()
    augmented = []
    for img in images:
        img_uint8  = (img * 255).astype(np.uint8)
        aug_uint8  = preprocessor.augment(img_uint8)
        augmented.append(aug_uint8.astype(np.float32) / 255.0)
    return np.array(augmented, dtype=np.float32)


# ── Main Training Loop ────────────────────────
def train():
    print("\n" + "═" * 50)
    print(" SignBridge Model Training")
    print("═" * 50)

    # Load data
    lm_seqs, imgs, raw_labels = load_dataset(DATASET_DIR)
    y = to_categorical(raw_labels, num_classes=NUM_CLASSES)

    # Train/val split
    X_lm_train, X_lm_val, X_img_train, X_img_val, y_train, y_val = train_test_split(
        lm_seqs, imgs, y,
        test_size=VAL_SPLIT,
        random_state=42,
        stratify=raw_labels
    )
    print(f"[Train] Train: {len(y_train)} | Val: {len(y_val)}")

    # Build model
    model = build_signbridge_model(freeze_mobilenet=True)
    compile_model(model)
    model.summary()

    # Callbacks
    model_path = os.path.join(MODEL_DIR, "sign_model.h5")
    callbacks  = [
        ModelCheckpoint(
            filepath=model_path,
            monitor="val_accuracy",
            save_best_only=True,
            verbose=1
        ),
        EarlyStopping(
            monitor="val_accuracy",
            patience=8,
            restore_best_weights=True,
            verbose=1
        ),
        ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=3,
            min_lr=1e-6,
            verbose=1
        ),
        TensorBoard(log_dir=LOG_DIR, histogram_freq=1)
    ]

    # Phase 1: Train with frozen MobileNet
    print("\n[Train] Phase 1: Training with frozen MobileNetV2 base...")
    history = model.fit(
        x=[X_lm_train, X_img_train],
        y=y_train,
        validation_data=([X_lm_val, X_img_val], y_val),
        batch_size=BATCH_SIZE,
        epochs=30,
        callbacks=callbacks,
        verbose=1
    )

    # Phase 2: Unfreeze top layers and fine-tune
    print("\n[Train] Phase 2: Fine-tuning top MobileNetV2 layers...")
    model = tf.keras.models.load_model(model_path)
    for layer in model.get_layer("mobilenetv2_1.00_224").layers[-40:]:
        layer.trainable = True

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-5),
        loss="categorical_crossentropy",
        metrics=["accuracy"]
    )

    history2 = model.fit(
        x=[X_lm_train, X_img_train],
        y=y_train,
        validation_data=([X_lm_val, X_img_val], y_val),
        batch_size=BATCH_SIZE,
        epochs=EPOCHS,
        initial_epoch=30,
        callbacks=callbacks,
        verbose=1
    )

    # Save final model
    final_path = os.path.join(MODEL_DIR, "sign_model_final.h5")
    model.save(final_path)
    print(f"\n[Train] ✅ Training complete! Final model saved to: {final_path}")
    print(f"[Train] Best checkpoint: {model_path}")

    # Evaluate
    val_loss, val_acc = model.evaluate([X_lm_val, X_img_val], y_val, verbose=0)
    print(f"[Train] Validation Accuracy: {val_acc * 100:.2f}%")

    return model


if __name__ == "__main__":
    train()
