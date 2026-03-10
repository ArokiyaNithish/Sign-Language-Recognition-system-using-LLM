# 🤟 SignBridge — LLM-Enhanced Real-Time Sign Language Recognition for Google Meet

> **Bridging communication gaps** between sign language users and hearing participants in Google Meet calls, using MediaPipe, TensorFlow, and Google Gemini AI.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.10+-green.svg)](https://python.org)
[![TensorFlow](https://img.shields.io/badge/TensorFlow-2.13-orange.svg)](https://tensorflow.org)
[![Gemini](https://img.shields.io/badge/Gemini-1.5--Pro-purple.svg)](https://ai.google.dev)

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [File Structure](#file-structure)
4. [Prerequisites](#prerequisites)
5. [Setup: Backend Server](#setup-backend-server)
6. [Setup: Chrome Extension](#setup-chrome-extension)
7. [Get Gemini API Key](#get-gemini-api-key)
8. [Download ASL Dataset](#download-asl-dataset)
9. [Train the Model](#train-the-model)
10. [Usage Guide](#usage-guide)
11. [Google Colab Training](#google-colab-training)
12. [Troubleshooting](#troubleshooting)
13. [API Reference](#api-reference)

---

## 🎯 Project Overview

SignBridge is a **Chrome Extension + Python FastAPI backend** that:

- **Detects sign language** from your webcam at 15fps using MediaPipe hand landmarks
- **Recognizes ASL letters** using a dual-input CNN+LSTM TensorFlow model
- **Converts signs to natural speech** using Google Gemini 1.5 Pro as an LLM interpreter
- **Speaks detected phrases** through Web Speech API TTS to meeting participants
- **Renders a live avatar** that animates hand positions for incoming voice participants
- **Records meetings** and generates AI-powered PDF summaries after the call
- Works **exclusively on Google Meet** (meet.google.com)

---

## 🏗️ Architecture

```
Chrome Extension (background.js)
       │
       ├── WebSocket (/ws/sign-recognition)
       │        │
       │        ▼
       │   Python FastAPI Backend (main.py)
       │        ├── MediaPipe Hands → landmark extraction
       │        ├── TensorFlow CNN+LSTM → sign classification
       │        ├── Google Gemini → signs to natural language
       │        └── ReportLab → PDF summary generation
       │
       └── Content Scripts (meet.google.com)
                ├── signDetector.js → camera capture & frame relay
                ├── speechSynthesis.js → TTS + Meet chat injection
                ├── avatarRenderer.js → canvas hand avatar
                ├── meetingRecorder.js → transcript + PDF trigger
                └── uiOverlay.js → floating control panel
```

---

## 📁 File Structure

```
signbridge/
├── extension/
│   ├── manifest.json
│   ├── popup/         (popup.html, popup.css, popup.js)
│   ├── content/       (content.js, signDetector.js, etc.)
│   ├── background/    (background.js)
│   └── assets/icons/
│
└── backend/
    ├── main.py
    ├── websocket_server.py
    ├── sign_recognition/  (model.py, predict.py, train.py, ...)
    ├── llm/               (gemini_client.py, context_manager.py, ...)
    ├── auth/              (auth.py, models.py, database.py)
    ├── pdf_generator/     (summary_pdf.py)
    ├── requirements.txt
    └── .env.example
```

---

## ⚙️ Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.10–3.11 | TF 2.13 not compatible with Python 3.12+ |
| Node.js | 18+ | Not required, but useful for Chrome dev tools |
| Google Chrome | 114+ | Required for Manifest V3 |
| Webcam | Any | Full HD recommended |

---

## 🐍 Setup: Backend Server

### 1. Clone and navigate

```bash
git clone <your-repo-url>
cd signbridge/backend
```

### 2. Create a virtual environment

```bash
python -m venv venv

# Windows:
venv\Scripts\activate

# macOS/Linux:
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

> ⚠️ **Note:** TensorFlow 2.13 requires Python 3.10 or 3.11. If you have Python 3.12+, use Google Colab for training (see below).

### 4. Configure environment variables

```bash
cp .env.example .env
# Edit .env and fill in your GEMINI_API_KEY and JWT_SECRET_KEY
```

### 5. Start the backend server

```bash
python main.py
# OR with auto-reload:
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at:
- **API Docs:** http://localhost:8000/docs
- **Health check:** http://localhost:8000/api/health
- **WebSocket:** ws://localhost:8000/ws/sign-recognition

---

## 🔌 Setup: Chrome Extension

### 1. Open Chrome Extensions

Navigate to: `chrome://extensions/`

### 2. Enable Developer Mode

Toggle **"Developer mode"** in the top-right corner.

### 3. Load Unpacked Extension

Click **"Load unpacked"** → select the `signbridge/extension/` folder.

### 4. Pin the Extension

Click the puzzle icon (🧩) in the Chrome toolbar → pin **SignBridge**.

### 5. Create an Account

Click the SignBridge icon → Sign Up with your email and password.

---

## 🔑 Get Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy the key
5. Paste it into `backend/.env` as `GEMINI_API_KEY=your_key_here`

> **Free tier:** Gemini 1.5 Pro has a generous free quota suitable for development.

---

## 📊 Download ASL Dataset

### Option A: Kaggle (Recommended)

1. Create a [Kaggle account](https://kaggle.com)
2. Install Kaggle CLI: `pip install kaggle`
3. Download your API key from Kaggle → Account settings → "Create New Token"
4. Run:

```bash
mkdir -p backend/data
cd backend/data

# Download ASL Alphabet dataset
kaggle datasets download -d grassknoted/asl-alphabet
unzip asl-alphabet.zip -d asl_dataset/

# The folder structure should be:
# data/asl_dataset/asl_alphabet_train/A/ B/ C/ ... Z/ space/ del/ nothing/
```

### Alternative ASL Datasets

- [asl-alphabet by grassknoted](https://www.kaggle.com/datasets/grassknoted/asl-alphabet) — 87,000 images, 29 classes
- [ASL Dataset](https://www.kaggle.com/datasets/ayuraj/asl-dataset) — Additional variety

---

## 🧠 Train the Model

### Option A: Local Training

```bash
cd backend

# Ensure dataset is at ./data/asl_dataset/
python sign_recognition/train.py
```

Training takes 2–4 hours on a modern GPU. The best model is saved to `./models/sign_model.h5`.

### Option B: Google Colab (Recommended for GPU)

See the [Google Colab Training](#google-colab-training) section below.

### Training Configuration

Edit `sign_recognition/train.py` to adjust:
- `EPOCHS = 50` — total training epochs
- `BATCH_SIZE = 32` — adjust for your GPU memory
- `VAL_SPLIT = 0.15` — validation split

---

## 🔬 Google Colab Training

**Use this when you don't have a local GPU.**

1. Open [Google Colab](https://colab.research.google.com)
2. Go to **Runtime → Change runtime type → GPU (T4 or A100)**
3. Create a new notebook and paste this code:

```python
# Mount Google Drive
from google.colab import drive
drive.mount('/content/drive')

# Install dependencies
!pip install tensorflow==2.13.0 mediapipe opencv-python scikit-learn

# Upload your dataset to Drive, then set path:
import os
os.environ['DATASET_DIR'] = '/content/drive/MyDrive/asl_dataset'
os.environ['MODEL_DIR']   = '/content/drive/MyDrive/signbridge_models'

# Upload backend/ folder to Colab or clone from GitHub
!git clone https://github.com/your-username/signbridge.git
%cd signbridge/backend

# Run training
!python sign_recognition/train.py
```

4. Download `sign_model.h5` from your Google Drive
5. Place it in `backend/models/sign_model.h5`

---

## 🚀 Usage Guide

1. **Start the backend server** (must be running before using the extension)
2. **Join a Google Meet call** at meet.google.com
3. **Click the SignBridge extension icon** → Sign In
4. **Enable "Sign → Voice" toggle** on the dashboard
5. **Allow camera access** when prompted by the browser
6. **Start signing** — your signs will be detected, converted to speech, and announced to participants
7. **Enable "Voice → Sign Avatar"** to see a hand avatar rendering what voice participants are saying
8. **Enable "Record Meeting"** to capture a transcript for AI summary
9. After the meeting, click **"Download Meeting Summary PDF"** for the AI-generated summary

---

## 🛠️ Troubleshooting

### ❌ "Cannot reach backend"
- Ensure `python main.py` is running on port 8000
- Check: http://localhost:8000/api/health

### ❌ Extension not showing in Meet
- Make sure you're on `https://meet.google.com/xxx-xxx-xxx` (in a call)
- Reload the Meet tab after installing the extension

### ❌ Camera access denied
- Chrome settings → Privacy → Camera → allow for meet.google.com
- The extension uses a second camera stream (separate from Meet's) for sign detection

### ❌ Model not found error
- Train the model first: `python sign_recognition/train.py`
- Or download a pre-trained model (the server runs in demo mode without it)

### ❌ TensorFlow install fails on Python 3.12
- Use Python 3.10 or 3.11: `py -3.11 -m venv venv`
- Or train on Google Colab

---

## 📡 API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server health check |
| `/api/auth/signup` | POST | Create account |
| `/api/auth/login` | POST | Login + get JWT |
| `/api/auth/me` | GET | Get current user |
| `/api/meeting/summarize` | POST | Submit transcript for AI summary |
| `/api/meeting/pdf/{id}` | GET | Download meeting PDF |
| `/ws/sign-recognition` | WS | Real-time sign recognition |

Full interactive docs: http://localhost:8000/docs

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

*Built with ❤️ using Google MediaPipe, TensorFlow, Gemini AI, FastAPI, and Chrome Extensions API.*
