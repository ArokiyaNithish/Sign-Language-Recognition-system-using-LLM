// signDetector.js - Captures camera frames and sends them to backend

class SignDetector {
    constructor(onFrameGenerated) {
        this.onFrameGenerated = onFrameGenerated;
        this.videoElement = null;
        this.canvas = null;
        this.ctx = null;
        this.stream = null;

        this.captureInterval = null;
        this.isActive = false;
        this.fps = 15; // Target frames per second

        this.init();
    }

    init() {
        // Hidden video element to hold camera stream
        this.videoElement = document.createElement('video');
        this.videoElement.autoplay = true;
        this.videoElement.playsInline = true;
        this.videoElement.muted = true;
        this.videoElement.style.display = 'none';
        document.body.appendChild(this.videoElement);

        // Hidden canvas to extract frames
        this.canvas = document.createElement('canvas');
        // Reduced resolution for faster WS transmission
        this.canvas.width = 320;
        this.canvas.height = 240;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }

    async start() {
        if (this.isActive) return;

        try {
            console.log('[SignBridge] Requesting camera access...');
            // We explicitly request camera independent of Google Meet
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: this.fps }
                },
                audio: false
            });

            this.videoElement.srcObject = this.stream;
            await this.videoElement.play();

            this.isActive = true;
            this.startCaptureLoop();
            console.log('[SignBridge] Camera capture started');
            return true;
        } catch (err) {
            console.error('[SignBridge] Failed to access camera:', err);
            // Usually because permissions are denied or camera is in use
            return false;
        }
    }

    stop() {
        if (!this.isActive) return;

        if (this.captureInterval) {
            clearInterval(this.captureInterval);
            this.captureInterval = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        this.videoElement.srcObject = null;
        this.isActive = false;
        console.log('[SignBridge] Camera capture stopped');
    }

    startCaptureLoop() {
        const intervalMs = 1000 / this.fps;

        this.captureInterval = setInterval(() => {
            this.captureFrame();
        }, intervalMs);
    }

    captureFrame() {
        if (!this.isActive || !this.videoElement.videoWidth) return;

        // Draw video frame to canvas
        this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);

        // Convert to highly compressed JPEG base64 string
        // Dataurl format: data:image/jpeg;base64,...
        const base64Data = this.canvas.toDataURL('image/jpeg', 0.6);

        // Strip the data:image/jpeg;base64, prefix to save bandwidth
        const pureBase64 = base64Data.split(',')[1];

        // Fire callback wrapper
        if (this.onFrameGenerated) {
            this.onFrameGenerated(pureBase64);
        }
    }
}

window.SignDetector = SignDetector;
