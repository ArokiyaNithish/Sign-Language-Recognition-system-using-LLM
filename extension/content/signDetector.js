// ════════════════════════════════════════════
// SignBridge — signDetector.js
// Camera capture + MediaPipe frame extraction
// WebSocket frame sender to backend
// ════════════════════════════════════════════

(function () {
    'use strict';
    if (window.__sbSignDetectorLoaded) return;
    window.__sbSignDetectorLoaded = true;

    const PREFIX = '[SignBridge SignDetector]';
    const FRAME_RATE = 15;
    const FRAME_INTERVAL_MS = Math.round(1000 / FRAME_RATE);
    const JPEG_QUALITY = 0.8;
    const DEBOUNCE_FRAMES = 3;
    const FRAME_QUEUE_MAX = 5;

    let videoEl = null;
    let canvasEl = null;
    let ctx = null;
    let captureInterval = null;
    let isRunning = false;
    let authToken = null;
    let userId = null;
    let lastSignText = null;
    let sameSignCount = 0;
    let frameQueue = [];
    let isProcessingQueue = false;
    let frameCount = 0;
    let fpsTimer = null;
    let fpsCounterStart = Date.now();
    let authLoaded = false;

    // ── Init ────────────────────────────────────
    async function init() {
        await loadAuth();
        setupCanvas();
        console.log(PREFIX, 'SignDetector initialized.');
    }

    async function loadAuth() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['sb_token', 'sb_user'], (data) => {
                if (data.sb_token) {
                    authToken = data.sb_token;
                    userId = data.sb_user ? (data.sb_user.id || data.sb_user.email) : 'unknown';
                    authLoaded = true;
                    console.log(PREFIX, 'Auth loaded, userId:', userId);
                } else {
                    console.warn(PREFIX, 'No auth token found.');
                }
                resolve();
            });
        });
    }

    function setupCanvas() {
        canvasEl = document.createElement('canvas');
        canvasEl.width = 640;
        canvasEl.height = 480;
        canvasEl.style.display = 'none';
        document.body.appendChild(canvasEl);
        ctx = canvasEl.getContext('2d');
    }

    // ── Camera Access ────────────────────────────
    async function startCamera() {
        if (isRunning) return;
        if (!authLoaded) await loadAuth();
        if (!authToken) {
            console.error(PREFIX, 'Cannot start: no auth token.');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: FRAME_RATE, max: 30 },
                    facingMode: 'user'
                },
                audio: false
            });

            videoEl = document.createElement('video');
            videoEl.srcObject = stream;
            videoEl.playsInline = true;
            videoEl.muted = true;
            videoEl.style.display = 'none';
            document.body.appendChild(videoEl);
            await videoEl.play();

            isRunning = true;
            startCapture();
            startFPSCounter();

            if (window.__sbOverlay) window.__sbOverlay.setStatus(true);
            console.log(PREFIX, 'Camera started.');

        } catch (err) {
            console.error(PREFIX, 'Camera access denied:', err.message);
            if (window.__sbOverlay) window.__sbOverlay.setStatus(false, '🔴 Camera access denied');
        }
    }

    function stopCamera() {
        if (!isRunning) return;
        isRunning = false;
        clearInterval(captureInterval);
        clearInterval(fpsTimer);

        if (videoEl) {
            const stream = videoEl.srcObject;
            if (stream) stream.getTracks().forEach(t => t.stop());
            videoEl.remove();
            videoEl = null;
        }

        if (window.__sbOverlay) window.__sbOverlay.setStatus(false);
        console.log(PREFIX, 'Camera stopped.');
    }

    // ── Frame Capture ────────────────────────────
    function startCapture() {
        captureInterval = setInterval(captureFrame, FRAME_INTERVAL_MS);
    }

    function captureFrame() {
        if (!isRunning || !videoEl || videoEl.readyState < 2) return;

        ctx.drawImage(videoEl, 0, 0, 640, 480);
        canvasEl.toBlob((blob) => {
            if (!blob) return;
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result.split(',')[1];
                enqueueFrame(base64);
            };
            reader.readAsDataURL(blob);
        }, 'image/jpeg', JPEG_QUALITY);
    }

    // ── Frame Queue & Send ────────────────────────
    function enqueueFrame(base64) {
        if (frameQueue.length >= FRAME_QUEUE_MAX) frameQueue.shift(); // drop oldest
        frameQueue.push({ data: base64, timestamp: Date.now() });
        if (!isProcessingQueue) drainQueue();
    }

    async function drainQueue() {
        isProcessingQueue = true;
        while (frameQueue.length > 0 && isRunning) {
            const frame = frameQueue.shift();
            await sendFrame(frame);
        }
        isProcessingQueue = false;
    }

    async function sendFrame(frame) {
        if (!authToken) return;

        return new Promise((resolve) => {
            chrome.runtime.sendMessage({
                type: 'SEND_FRAME',
                data: frame.data,
                userId: userId,
                timestamp: frame.timestamp
            }, (resp) => {
                if (chrome.runtime.lastError) {
                    console.warn(PREFIX, 'Send failed:', chrome.runtime.lastError.message);
                }
                resolve(resp);
            });
        });
    }

    // ── FPS Counter ──────────────────────────────
    function startFPSCounter() {
        fpsCounterStart = Date.now();
        frameCount = 0;
        fpsTimer = setInterval(() => {
            const elapsed = (Date.now() - fpsCounterStart) / 1000;
            const fps = Math.round(frameCount / elapsed);
            chrome.runtime.sendMessage({ type: 'FRAME_RATE_UPDATE', fps }).catch(() => { });
            frameCount = 0;
            fpsCounterStart = Date.now();
        }, 2000);
    }

    // ── Recognition Result Handler ────────────────
    function handleRecognitionResult(msg) {
        if (!msg || !msg.text) return;

        // Debounce: ignore same sign repeating
        if (msg.text === lastSignText) {
            sameSignCount++;
            if (sameSignCount > DEBOUNCE_FRAMES) return;
        } else {
            sameSignCount = 0;
            lastSignText = msg.text;
        }

        frameCount++;

        if (window.__sbOverlay) {
            window.__sbOverlay.updateDetection(msg.text, msg.confidence);
            window.__sbOverlay.setProcessing(false);
        }

        // Fire event for content.js orchestrator
        document.dispatchEvent(new CustomEvent('sb:signDetected', {
            detail: {
                text: msg.text,
                confidence: msg.confidence,
                rawSign: msg.raw_sign,
                landmarks: msg.landmarks
            }
        }));
    }

    // ── External API ─────────────────────────────
    window.__sbSignDetector = {
        start: startCamera,
        stop: stopCamera,
        isRunning: () => isRunning,
        onResult: handleRecognitionResult
    };

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'SIGN_RECOGNITION') {
            handleRecognitionResult(msg);
        }
        if (msg.type === 'AUTH_UPDATE') {
            authToken = msg.token;
            userId = msg.user ? (msg.user.id || msg.user.email) : userId;
            authLoaded = true;
        }
        if (msg.type === 'WS_STATUS' && msg.status === 'connected') {
            if (window.__sbOverlay && isRunning) window.__sbOverlay.setStatus(true);
        }
    });

    init().catch(console.error);
    console.log(PREFIX, 'signDetector.js loaded.');
})();
