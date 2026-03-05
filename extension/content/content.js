// content.js - Primary orchestrator for the Google Meet extension
console.log('[SignBridge] Content script loaded into Google Meet');

class SignBridgeExtension {
    constructor() {
        this.ui = null;
        this.detector = null;
        // We will initialize renderer and dictation later
        this.avatarRenderer = null;
        this.speechSynthesis = null;
        this.recorder = null;

        this.settings = {
            signToVoice: true,
            voiceToSign: true,
            recordMeeting: false
        };

        this.isMuted = false;
        this.lastSignSent = '';

        // Check if we are actually in a meeting (Meet URL contains hyphens, not just home page)
        this.checkIfInMeeting();
    }

    checkIfInMeeting() {
        // A real meet URL looks like meet.google.com/abc-defg-hij
        const pathname = window.location.pathname;
        const isMeetingUrl = /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(pathname);

        if (isMeetingUrl) {
            // Meet DOM loads asynchronously, wait for main container
            const checkInterval = setInterval(() => {
                // Find a main element that indicates the meeting is active
                // (This selector might need updating based on Google Meet changes)
                const meetContainer = document.querySelector('[data-meeting-id]') ||
                    document.querySelector('.crqnQb'); // Common main wrapper

                if (meetContainer) {
                    clearInterval(checkInterval);
                    this.initialize();
                }
            }, 1000);
        } else {
            console.log('[SignBridge] Not a meeting room URL, waiting...');
        }
    }

    async initialize() {
        console.log('[SignBridge] Initializing meeting integration...');

        // Inform background script we joined
        chrome.runtime.sendMessage({ type: 'MEET_JOINED' }, (response) => {
            if (response && response.settings) {
                this.settings = response.settings;
            }
        });

        // 1. Initialize UI Overlay
        if (window.SignBridgeUI) {
            this.ui = new window.SignBridgeUI();
        } else {
            console.error('[SignBridge] UI Overlay class not found');
            return;
        }

        // 2. Initialize Avatar Renderer
        if (window.AvatarRenderer) {
            this.avatarRenderer = new window.AvatarRenderer(this.ui.getCanvasContext());
        }

        // 3. Initialize Speech Synthesis
        if (window.MeetSpeechSynthesis) {
            this.speechSynthesis = new window.MeetSpeechSynthesis();
        }

        // 4. Initialize Camera Capture
        if (window.SignDetector) {
            this.detector = new window.SignDetector((frameBase64) => {
                this.handleNewFrame(frameBase64);
            });

            if (this.settings.signToVoice) {
                await this.detector.start();
            }
        }

        // 5. Initialize Recorder
        if (window.MeetingRecorder && this.settings.recordMeeting) {
            this.recorder = new window.MeetingRecorder();
            this.recorder.start();
        }

        // Listeners
        this.setupMessageListeners();
        this.monitorMeetMuteState();

        // Clean up when leaving meeting
        window.addEventListener('beforeunload', () => this.cleanup());
    }

    handleNewFrame(frameBase64) {
        if (!this.settings.signToVoice) return;

        // Only send frames if user is NOT muted in Google Meet
        // Or if we decide to override mute for sign language

        chrome.runtime.sendMessage({
            type: 'SEND_FRAME',
            frame: frameBase64
        });
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            switch (msg.type) {
                case 'WS_STATUS':
                    if (this.ui) this.ui.setConnectionStatus(msg.connected);
                    break;

                case 'UPDATE_SETTINGS':
                    this.settings = msg.settings;
                    this.applySettings();
                    break;

                case 'recognition':
                    // We received a completed translation from the backend
                    this.handleRecognizedSign(msg);
                    break;

                case 'avatar_sign':
                    // Received instructions to draw hand landmarks for the avatar
                    if (this.settings.voiceToSign && this.avatarRenderer) {
                        this.avatarRenderer.renderHands(msg.landmarks);
                    }
                    break;
            }
        });
    }

    applySettings() {
        if (this.settings.signToVoice && !this.detector.isActive) {
            this.detector.start();
        } else if (!this.settings.signToVoice && this.detector.isActive) {
            this.detector.stop();
        }

        if (this.settings.recordMeeting && (!this.recorder || !this.recorder.isRecording)) {
            if (!this.recorder) this.recorder = new window.MeetingRecorder();
            this.recorder.start();
        } else if (!this.settings.recordMeeting && this.recorder && this.recorder.isRecording) {
            this.recorder.stop();
        }

        if (!this.settings.voiceToSign && this.avatarRenderer) {
            this.avatarRenderer.clear();
        }
    }

    handleRecognizedSign(data) {
        const { text, confidence, raw_sign } = data;

        // Avoid double speaking identical consecutive phrases within a short window
        if (text === this.lastSignSent) return;
        this.lastSignSent = text;
        setTimeout(() => { this.lastSignSent = ''; }, 3000);

        // Update UI Ticker
        if (this.ui) {
            this.ui.addTranscriptItem(text, true, confidence);
        }

        // Log for recorder
        if (this.recorder && this.recorder.isRecording) {
            this.recorder.addTranscriptEntry('sign_user', text);
        }

        // Inject into meeting (TTS & Chat)
        if (this.speechSynthesis && this.settings.signToVoice) {
            this.speechSynthesis.speakAndInject(text);
        }
    }

    monitorMeetMuteState() {
        // Note: This relies on Google Meet's DOM structure which can change.
        // Usually the mute button has specific aria-labels or data-is-muted attributes.
        setInterval(() => {
            const micBtn = document.querySelector('button[aria-label*="microphone"], button[aria-label*="Microphone"]');
            if (micBtn) {
                // Some buttons use aria-pressed or check data attributes
                const isMuted = micBtn.getAttribute('data-is-muted') === 'true' ||
                    (micBtn.getAttribute('aria-label') || '').toLowerCase().includes('turn on');
                this.isMuted = isMuted;

                // Optionally update UI based on Meet's mute state
            }
        }, 1000);
    }

    cleanup() {
        console.log('[SignBridge] Cleaning up meeting integration...');
        if (this.detector) this.detector.stop();
        if (this.recorder) this.recorder.stopAndGenerateSummary();
        chrome.runtime.sendMessage({ type: 'MEET_LEFT' });
    }
}

// Ensure dependent scripts load first by specifying run_at: document_idle in manifest.
// We kickstart when the window is fully loaded just in case.
window.onload = () => {
    // Little delay to let Meets heavy scripts settle
    setTimeout(() => {
        window.signBridgeApp = new SignBridgeExtension();
    }, 3000);
};
