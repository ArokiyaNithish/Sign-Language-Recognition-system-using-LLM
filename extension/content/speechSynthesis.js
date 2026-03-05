// speechSynthesis.js - Text-to-Speech and Chat Injection for Google Meet

class MeetSpeechSynthesis {
    constructor() {
        this.synth = window.speechSynthesis;
        this.voice = null;
        this.queue = [];
        this.isSpeaking = false;

        this.initVoice();
    }

    initVoice() {
        const setVoice = () => {
            const voices = this.synth.getVoices();
            if (voices.length === 0) return;

            // Prefer a high quality US English female voice (Google if available)
            this.voice = voices.find(v => v.name.includes('Google US English')) ||
                voices.find(v => v.lang === 'en-US' && v.name.includes('Female')) ||
                voices.find(v => v.lang.startsWith('en')) ||
                voices[0];

            console.log('[SignBridge] Selected TTS voice:', this.voice ? this.voice.name : 'Unknown');
        };

        setVoice();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = setVoice;
        }
    }

    speakAndInject(text) {
        if (!text) return;

        // 1. Add to text-to-speech queue
        this.queue.push(text);
        this.processQueue();

        // 2. Inject into Google Meet chat
        this.injectIntoChat(text);
    }

    processQueue() {
        if (this.isSpeaking || this.queue.length === 0) return;
        if (!this.voice) {
            console.warn('[SignBridge] No TTS voice available');
            // Still remove from queue
            this.queue.shift();
            return;
        }

        const text = this.queue.shift();
        this.isSpeaking = true;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.voice;
        utterance.rate = 0.9; // Slightly slower for clarity
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        utterance.onend = () => {
            this.isSpeaking = false;
            // Small pause before next word
            setTimeout(() => this.processQueue(), 200);
        };

        utterance.onerror = (e) => {
            console.error('[SignBridge] TTS Error:', e);
            this.isSpeaking = false;
            this.processQueue();
        };

        this.synth.speak(utterance);

        // TODO: Advanced feature - route this audio directly into the Meet microphone stream
        // Currently, it plays through speakers. If user is unmuted and not using headphones,
        // their mic will pick it up and broadcast to the meeting.
        // A more robust implementation involves creating a Web Audio API MediaStreamDestination,
        // connecting the TTS output to it, and swapping the Meet track. 
        // Meet makes this difficult intentionally, so playing over speakers is the v1 approach.
    }

    injectIntoChat(text) {
        // Note: Google Meet DOM is heavily obfuscated and changes frequently.
        // This is a best-effort approach to find the chat input.

        try {
            // 1. First ensure chat panel is open (Optional - might be too intrusive to force open)
            // Array of possible chat input selectors in Meet
            const possibleSelectors = [
                'textarea[data-id="chat-input"]',
                'textarea[aria-label="Send a message to everyone"]',
                'textarea.VfPpkd-fmcmS-wGMbrd'
            ];

            let chatInput = null;
            for (const sel of possibleSelectors) {
                chatInput = document.querySelector(sel);
                if (chatInput) break;
            }

            if (!chatInput) {
                console.log('[SignBridge] Chat input not found or closed. Cannot inject text.');
                return;
            }

            // 2. Set the value
            const prefix = "(Signs) ";
            chatInput.value = prefix + text;

            // 3. Dispatch events to trigger React's internal state updates
            chatInput.dispatchEvent(new Event('input', { bubbles: true }));
            chatInput.dispatchEvent(new Event('change', { bubbles: true }));

            // 4. Find and click the send button
            const sendButtonSelectors = [
                'button[data-id="send-message"]',
                'button[aria-label="Send message"]',
                '.VfPpkd-LgbsSe-OWXEXe-k8QpJ'
            ];

            let sendBtn = null;
            // The send button is usually a sibling or close relative to the text area
            const chatContainer = chatInput.closest('div[role="region"]') || chatInput.parentElement.parentElement;
            if (chatContainer) {
                for (const sel of sendButtonSelectors) {
                    sendBtn = chatContainer.querySelector(sel);
                    if (sendBtn && !sendBtn.disabled) break;
                }
            }

            if (sendBtn && !sendBtn.disabled) {
                sendBtn.click();
                console.log('[SignBridge] Injected signs into chat:', text);
            }

        } catch (e) {
            console.warn('[SignBridge] Failed to inject into Meet chat:', e);
        }
    }
}

window.MeetSpeechSynthesis = MeetSpeechSynthesis;
