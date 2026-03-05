// meetingRecorder.js - Captures meeting audio/video and maintains a text transcript

class MeetingRecorder {
    constructor() {
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.transcript = [];
        this.meetingId = `meet_${Date.now()}`;
        this.startTime = null;
        this.intervalId = null;

        // Web Speech API for transcribing other people's voices
        // (Our signs are already captured via the WebSocket)
        this.speechRecognition = null;
    }

    async start() {
        if (this.isRecording) return;

        console.log('[SignBridge] Starting meeting recording...');
        this.startTime = Date.now();
        this.isRecording = true;
        this.recordedChunks = [];
        this.transcript = [];

        try {
            // 1. Setup speech recognition for incoming voices
            this.setupSpeechRecognition();

            // 2. We can try to capture screen/tab using modern generic getDisplayMedia
            // Since chrome.tabCapture requires user interaction from the extension action,
            // in a content script we rely on getDisplayMedia, which prompts the user once.
            // We will skip actual video recording for the MVP as the core product is the text/PDF.
            // But we will capture the transcript perfectly.

            this.intervalId = setInterval(() => this.autoSaveTranscript(), 60000); // Save every min

            console.log('[SignBridge] Meeting recorder active');

        } catch (e) {
            console.error('[SignBridge] Failed to start meeting recorder:', e);
            this.isRecording = false;
        }
    }

    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('[SignBridge] Speech Recognition API not supported in this browser');
            return;
        }

        this.speechRecognition = new SpeechRecognition();
        this.speechRecognition.continuous = true;
        this.speechRecognition.interimResults = false;
        this.speechRecognition.lang = 'en-US';

        this.speechRecognition.onresult = (event) => {
            // Get the latest transcript
            const lastResultIndex = event.results.length - 1;
            const text = event.results[lastResultIndex][0].transcript.trim();

            if (text) {
                this.addTranscriptEntry('voice_user', text);
            }
        };

        this.speechRecognition.onerror = (event) => {
            if (event.error !== 'no-speech') {
                console.warn('[SignBridge] Speech recognition error:', event.error);
            }
        };

        this.speechRecognition.onend = () => {
            // Auto-restart if we are still recording (it sometimes times out)
            if (this.isRecording) {
                try {
                    this.speechRecognition.start();
                } catch (e) {
                    // ignore
                }
            }
        };

        try {
            this.speechRecognition.start();
        } catch (e) {
            console.error('[SignBridge] Could not start speech recognition:', e);
        }
    }

    // Called from content.js when a sign is recognized
    addTranscriptEntry(speaker, text) {
        if (!this.isRecording) return;

        this.transcript.push({
            timestamp: new Date().toISOString(),
            relative_ms: Date.now() - this.startTime,
            speaker: speaker, // "sign_user" or "voice_user"
            text: text
        });

        console.log(`[SignBridge] Transcript Add [${speaker}]:`, text);
    }

    autoSaveTranscript() {
        // Save to local storage as backup
        chrome.storage.local.set({
            [`signbridge_transcript_${this.meetingId}`]: this.transcript
        });
    }

    async stopAndGenerateSummary() {
        if (!this.isRecording) return;

        console.log('[SignBridge] Stopping recorder and generating summary...');
        this.isRecording = false;
        if (this.intervalId) clearInterval(this.intervalId);

        if (this.speechRecognition) {
            this.speechRecognition.stop();
        }

        // Filter out empty transcripts to save backend processing
        if (this.transcript.length === 0) {
            console.log('[SignBridge] Transcript is empty, skipping summary.');
            return;
        }

        try {
            // Get auth token
            const result = await new Promise(res => chrome.storage.local.get(['signbridge_token'], res));
            const token = result.signbridge_token;

            if (!token) {
                throw new Error("Cannot generate summary: User not authenticated.");
            }

            // Send to backend via fetch (not WS) because it's a discrete one-time action
            const response = await fetch('http://localhost:8000/api/meeting/summarize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    meeting_id: this.meetingId,
                    duration_seconds: Math.floor((Date.now() - this.startTime) / 1000),
                    transcript: this.transcript
                })
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            const data = await response.json();
            console.log('[SignBridge] Summary generated successfully:', data.meeting_id);

            // Notify background script that summary is ready (shows button in popup)
            chrome.runtime.sendMessage({
                type: 'MEETING_ENDED',
                hasSummary: true,
                meetingId: data.meeting_id
            });

        } catch (err) {
            console.error('[SignBridge] Failed to generate summary:', err);
        }
    }
}

window.MeetingRecorder = MeetingRecorder;
