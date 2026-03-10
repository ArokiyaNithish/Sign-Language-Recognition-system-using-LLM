class DummySignDetector {
    constructor() {
        this.intervalId = null;
        this.phrases = [
            "Hello everyone",
            "I am using sign language",
            "Can you hear me?",
            "Yes, I understand",
            "Thank you",
            "Goodbye"
        ];
    }

    // Simulates hooking up MediaPipe to the video stream and recognizing signs
    startDetection(videoElement, onTextDetected) {
        if (!videoElement) return;
        console.log("Started Sign Detection with MediaPipe simulator...");

        // Simulate detecting a sign phrase every 5...8 seconds
        this.intervalId = setInterval(() => {
            const randomPhrase = this.phrases[Math.floor(Math.random() * this.phrases.length)];
            onTextDetected(randomPhrase);
        }, 5000 + Math.random() * 3000);
    }

    stopDetection() {
        console.log("Stopped Sign Detection.");
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
}

export const signDetector = new DummySignDetector();
