import os
import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping, ReduceLROnPlateau
from .model import build_sign_model

# Constants
SEQUENCE_LENGTH = 30
LANDMARK_DIM = 126
IMAGE_SHAPE = (224, 224, 3)
NUM_CLASSES = 29
BATCH_SIZE = 32
EPOCHS = 50

# Dataset Paths (Placeholder for user to replace)
DATASET_PATH = "./dataset"
LANDMARKS_PATH = os.path.join(DATASET_PATH, "landmarks.npy") # shape: (N, 30, 126)
IMAGES_PATH = os.path.join(DATASET_PATH, "images.npy")       # shape: (N, 224, 224, 3)
LABELS_PATH = os.path.join(DATASET_PATH, "labels.npy")       # shape: (N, 29)

def augment_image(image):
    # Data augmentation: rotation, brightness, flip
    image = tf.image.random_brightness(image, max_delta=0.2)
    
    # Slight random horizontal flip (Careful with ASL as left/right can mean different things!)
    # Actually, for ASL spelling, mirroring is often acceptable, but some signs are directional.
    # To be safe, we omit flip here for rigid ASL alphabet but include for general gestures.
    # image = tf.image.random_flip_left_right(image)
    return image

def preprocess_data(landmarks, image, label):
    # MobileNetV2 expects [-1, 1] inputs for images
    image = tf.cast(image, tf.float32)
    image = tf.keras.applications.mobilenet_v2.preprocess_input(image)
    image = augment_image(image)
    return (landmarks, image), label

def train_model():
    print("Loading dataset...")
    if not os.path.exists(LANDMARKS_PATH):
        print(f"Error: Dataset not found at {DATASET_PATH}.")
        print("Please download Kaggle ASL dataset and run data extraction scripts first.")
        print("Creating dummy data to demonstrate training loop...")
        
        # Dummy data for demonstration
        num_samples = 100
        X_land = np.random.rand(num_samples, SEQUENCE_LENGTH, LANDMARK_DIM).astype(np.float32)
        X_img = np.random.randint(0, 255, (num_samples, 224, 224, 3), dtype=np.uint8)
        
        y_labels = np.zeros((num_samples, NUM_CLASSES))
        for i in range(num_samples):
            y_labels[i, np.random.randint(0, NUM_CLASSES)] = 1
    else:
        X_land = np.load(LANDMARKS_PATH)
        X_img = np.load(IMAGES_PATH)
        y_labels = np.load(LABELS_PATH)

    print(f"Dataset shape: Landmarks {X_land.shape}, Images {X_img.shape}, Labels {y_labels.shape}")

    # Split
    land_train, land_val, img_train, img_val, y_train, y_val = train_test_split(
        X_land, X_img, y_labels, test_size=0.2, random_state=42
    )

    # Create tf.data.Dataset
    train_dataset = tf.data.Dataset.from_tensor_slices((land_train, img_train, y_train))
    train_dataset = train_dataset.map(preprocess_data, num_parallel_calls=tf.data.AUTOTUNE)
    train_dataset = train_dataset.shuffle(1000).batch(BATCH_SIZE).prefetch(tf.data.AUTOTUNE)

    val_dataset = tf.data.Dataset.from_tensor_slices((land_val, img_val, y_val))
    # We do not augment validation data, but still preprocess the image
    def val_preprocess(landmarks, image, label):
        image = tf.cast(image, tf.float32)
        image = tf.keras.applications.mobilenet_v2.preprocess_input(image)
        return (landmarks, image), label
    
    val_dataset = val_dataset.map(val_preprocess, num_parallel_calls=tf.data.AUTOTUNE)
    val_dataset = val_dataset.batch(BATCH_SIZE).prefetch(tf.data.AUTOTUNE)

    # Build Model
    model = build_sign_model(num_classes=NUM_CLASSES)
    
    # Compile
    optimizer = tf.keras.optimizers.Adam(learning_rate=0.001)
    model.compile(optimizer=optimizer, loss='categorical_crossentropy', metrics=['accuracy'])

    # Callbacks
    os.makedirs("../models", exist_ok=True)
    checkpoint_filepath = '../models/sign_model.h5'
    
    model_checkpoint_callback = ModelCheckpoint(
        filepath=checkpoint_filepath,
        save_weights_only=False,
        monitor='val_accuracy',
        mode='max',
        save_best_only=True)
        
    early_stop = EarlyStopping(patience=10, restore_best_weights=True)
    reduce_lr = ReduceLROnPlateau(factor=0.5, patience=5, min_lr=0.00001)

    # Train
    print("Starting training...")
    history = model.fit(
        train_dataset,
        validation_data=val_dataset,
        epochs=EPOCHS,
        callbacks=[model_checkpoint_callback, early_stop, reduce_lr]
    )

    print(f"Training completed. Best model saved to {checkpoint_filepath}")

if __name__ == "__main__":
    train_model()
