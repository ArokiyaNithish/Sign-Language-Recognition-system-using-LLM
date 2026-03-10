// ════════════════════════════════════════════
// SignBridge — speechSynthesis.js
// TTS output + Meet chat injection
// ════════════════════════════════════════════

(function () {
    'use strict';
    if (window.__sbSpeechLoaded) return;
    window.__sbSpeechLoaded = true;

    const PREFIX = '[SignBridge Speech]';
    const TTS_RATE = 0.9;
    const TTS_PITCH = 1.0;
    const TTS_VOLUME = 1.0;

    let speakQueue = [];
    let isSpeaking = false;
    let preferredVoice = null;
    let ttsEnabled = true;
    let chatEnabled = true;

    // ── Voice Setup ──────────────────────────────
    function findVoice() {
        const voices = window.speechSynthesis.getVoices();
        if (!voices.length) return null;

        // Priority: Google US English Female → any en-US → any English
        const priority = [
            v => v.name.toLowerCase().includes('google') && v.lang === 'en-US' && v.name.toLowerCase().includes('female'),
            v => v.name.toLowerCase().includes('google') && v.lang === 'en-US',
            v => v.lang === 'en-US',
            v => v.lang.startsWith('en'),
        ];

        for (const check of priority) {
            const found = voices.find(check);
            if (found) return found;
        }
        return voices[0];
    }

    function ensureVoice() {
        if (!preferredVoice) preferredVoice = findVoice();
    }

    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => {
            preferredVoice = findVoice();
            console.log(PREFIX, 'Voice selected:', preferredVoice?.name);
        };
    }

    // ── TTS Queue ────────────────────────────────
    function enqueueSpeak(text) {
        if (!text || !ttsEnabled) return;
        speakQueue.push(text);
        processQueue();
    }

    function processQueue() {
        if (isSpeaking || speakQueue.length === 0) return;
        const text = speakQueue.shift();
        speakText(text);
    }

    function speakText(text) {
        if (!text) return;
        ensureVoice();

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = TTS_RATE;
        utterance.pitch = TTS_PITCH;
        utterance.volume = TTS_VOLUME;
        if (preferredVoice) utterance.voice = preferredVoice;

        utterance.onstart = () => {
            isSpeaking = true;
            console.log(PREFIX, 'Speaking:', text);
        };

        utterance.onend = () => {
            isSpeaking = false;
            // Small delay between phrases
            setTimeout(processQueue, 250);
        };

        utterance.onerror = (err) => {
            console.error(PREFIX, 'TTS error:', err.error);
            isSpeaking = false;
            processQueue();
        };

        window.speechSynthesis.speak(utterance);
    }

    // ── Meet Chat Injection ───────────────────────
    function injectToMeetChat(text) {
        if (!chatEnabled || !text) return;

        try {
            // Google Meet chat input selectors (may change with updates)
            const selectors = [
                '[data-message-text="true"]',
                'textarea[placeholder*="message"]',
                'textarea[aria-label*="message"]',
                '[contenteditable="true"][data-is-typing]',
                '[contenteditable="plaintext-only"]'
            ];

            let chatInput = null;
            for (const sel of selectors) {
                chatInput = document.querySelector(sel);
                if (chatInput) break;
            }

            if (!chatInput) {
                console.warn(PREFIX, 'Meet chat input not found.');
                return;
            }

            const formattedText = `[SignBridge] ${text}`;

            // Handle both input and contenteditable elements
            if (chatInput.tagName === 'TEXTAREA' || chatInput.tagName === 'INPUT') {
                chatInput.focus();
                const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
                nativeInputSetter.call(chatInput, formattedText);
                chatInput.dispatchEvent(new Event('input', { bubbles: true }));
                chatInput.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                // contenteditable
                chatInput.focus();
                chatInput.textContent = formattedText;
                chatInput.dispatchEvent(new InputEvent('input', { bubbles: true, data: formattedText }));
            }

            // Click send button
            setTimeout(() => {
                const sendSelectors = [
                    'button[data-tooltip*="Send"]',
                    'button[aria-label*="Send"]',
                    'button[jsname="Qx7uuf"]',
                    '[data-tooltip="Send message"]'
                ];
                for (const sel of sendSelectors) {
                    const btn = document.querySelector(sel);
                    if (btn) { btn.click(); break; }
                }
            }, 150);

            console.log(PREFIX, 'Injected to Meet chat:', formattedText);

        } catch (err) {
            console.error(PREFIX, 'Chat injection error:', err);
        }
    }

    // ── Phrase Handler ────────────────────────────
    function handlePhrase(text) {
        if (!text) return;
        if (ttsEnabled) enqueueSpeak(text);
        if (chatEnabled) injectToMeetChat(text);

        if (window.__sbOverlay) window.__sbOverlay.appendTranscript(text);
    }

    // ── External API ─────────────────────────────
    window.__sbSpeech = {
        speak: enqueueSpeak,
        inject: injectToMeetChat,
        handle: handlePhrase,
        setTTS: (v) => { ttsEnabled = v; console.log(PREFIX, 'TTS', v ? 'on' : 'off'); },
        setChat: (v) => { chatEnabled = v; console.log(PREFIX, 'Chat injection', v ? 'on' : 'off'); },
    };

    // Listen for phrase events
    document.addEventListener('sb:phraseReady', (e) => handlePhrase(e.detail));

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'PHRASE_READY') handlePhrase(msg.text);
        if (msg.type === 'SETTINGS_UPDATE') {
            if (msg.settings) {
                ttsEnabled = msg.settings.signVoice ?? ttsEnabled;
            }
        }
    });

    console.log(PREFIX, 'speechSynthesis.js loaded.');
})();
