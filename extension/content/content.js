// ════════════════════════════════════════════
// SignBridge — content.js
// Main orchestrator for Google Meet integration
// Initializes all modules and manages state
// ════════════════════════════════════════════

(function () {
    'use strict';
    if (window.__sbContentLoaded) return;
    window.__sbContentLoaded = true;

    const PREFIX = '[SignBridge]';

    // ── Extension State ──────────────────────────
    const state = {
        inMeeting: false,
        signVoice: false,
        voiceSign: false,
        record: false,
        detecting: false,
        avatarOn: false,
        ttsOn: true,
    };

    let meetingObserver = null;
    let transcriptBuffer = [];
    let phraseBuffer = [];
    let phraseTimer = null;
    const PHRASE_TIMEOUT = 1800; // ms wait before sending letters as phrase to LLM

    // ── Init ────────────────────────────────────
    async function init() {
        console.log(PREFIX, 'Content script initializing on', window.location.href);

        // Load auth & settings
        await loadSettings();

        // Create UI overlay
        if (window.__sbOverlay) window.__sbOverlay.create();
        if (window.__sbAvatar) window.__sbAvatar.create();

        // Detect meeting join/leave
        observeMeeting();

        // Override quick-toggle callbacks from uiOverlay
        window.__sbToggleDetect = () => toggleFeature('detect');
        window.__sbToggleAvatar = () => toggleFeature('avatar');
        window.__sbToggleRecord = () => toggleFeature('record');
        window.__sbToggleTTS = () => toggleFeature('tts');

        // Listen for sign detection events
        document.addEventListener('sb:signDetected', onSignDetected);

        // Listen for toggle events from overlay buttons
        document.addEventListener('sb:toggle', (e) => toggleFeature(e.detail));

        // Listen for meeting ended
        document.addEventListener('sb:meetingEnded', (e) => {
            if (window.__sbAvatar) window.__sbAvatar.hide();
        });

        // Listen for messages from background/popup
        chrome.runtime.onMessage.addListener(handleMessage);

        console.log(PREFIX, 'Content script ready.');
    }

    // ── Load Settings ────────────────────────────
    async function loadSettings() {
        return new Promise(resolve => {
            chrome.storage.local.get(['sb_settings', 'sb_token', 'sb_user'], (data) => {
                const s = data.sb_settings || {};
                state.signVoice = s.signVoice ?? false;
                state.voiceSign = s.voiceSign ?? false;
                state.record = s.record ?? false;
                applySettings();
                resolve();
            });
        });
    }

    function applySettings() {
        if (window.__sbSpeech) {
            window.__sbSpeech.setTTS(state.signVoice);
        }
    }

    // ── Meeting Detection ─────────────────────────
    function observeMeeting() {
        const target = document.body;
        meetingObserver = new MutationObserver(() => {
            checkMeetingStatus();
        });
        meetingObserver.observe(target, { childList: true, subtree: true });

        // Initial check
        checkMeetingStatus();
    }

    function checkMeetingStatus() {
        // Google Meet meeting room indicators
        const inMeetingNow = !!(
            document.querySelector('[data-meeting-title]') ||
            document.querySelector('[data-call-ended]') ||
            document.querySelector('[data-self-name]') ||
            document.querySelector('.NzPR9b') ||      // leave button
            document.querySelector('[jsname="EieBtf"]') || // tile grid
            document.querySelector('[aria-label*="Leave call"]') ||
            document.querySelector('[aria-label*="You left"]')
        );

        const leaving = !!(
            document.querySelector('[data-call-ended="true"]') ||
            (document.title && document.title.toLowerCase().includes('left the call'))
        );

        if (inMeetingNow && !state.inMeeting) {
            onMeetingJoined();
        } else if (!inMeetingNow && state.inMeeting && leaving) {
            onMeetingLeft();
        }
    }

    function onMeetingJoined() {
        if (state.inMeeting) return;
        state.inMeeting = true;
        console.log(PREFIX, 'Meeting joined!');

        if (window.__sbOverlay) window.__sbOverlay.show();

        // Auto-start features based on saved settings
        if (state.signVoice && !state.detecting) startDetection();
        if (state.voiceSign && !state.avatarOn) enableAvatar();
        if (state.record && !window.__sbRecorder?.isRecording()) {
            window.__sbRecorder?.start();
        }

        // Notify popup
        chrome.runtime.sendMessage({ type: 'MEETING_STARTED' }).catch(() => { });
    }

    function onMeetingLeft() {
        if (!state.inMeeting) return;
        state.inMeeting = false;
        console.log(PREFIX, 'Meeting left.');

        // Stop everything
        stopDetection();
        disableAvatar();
        window.__sbRecorder?.stop();

        if (window.__sbOverlay) window.__sbOverlay.hide();
    }

    // ── Feature Toggles ───────────────────────────
    function toggleFeature(feature) {
        switch (feature) {
            case 'detect':
                state.detecting ? stopDetection() : startDetection();
                break;
            case 'avatar':
                state.avatarOn ? disableAvatar() : enableAvatar();
                break;
            case 'record':
                if (window.__sbRecorder) {
                    window.__sbRecorder.isRecording()
                        ? window.__sbRecorder.stop()
                        : window.__sbRecorder.start();
                }
                break;
            case 'tts':
                state.ttsOn = !state.ttsOn;
                if (window.__sbSpeech) window.__sbSpeech.setTTS(state.ttsOn);
                updateOverlayButton('sb-toggle-tts', state.ttsOn, '🔊 TTS ON', '🔇 TTS OFF');
                break;
        }
    }

    function startDetection() {
        if (state.detecting) return;
        state.detecting = true;
        window.__sbSignDetector?.start();
        if (window.__sbOverlay) window.__sbOverlay.setStatus(true);
        updateOverlayButton('sb-toggle-detect', true, '🤟 Detect ON', '🤟 Detect OFF');
        console.log(PREFIX, 'Sign detection started.');
    }

    function stopDetection() {
        if (!state.detecting) return;
        state.detecting = false;
        window.__sbSignDetector?.stop();
        if (window.__sbOverlay) window.__sbOverlay.setStatus(false);
        updateOverlayButton('sb-toggle-detect', false, '🤟 Detect ON', '🤟 Detect OFF');
        console.log(PREFIX, 'Sign detection stopped.');
    }

    function enableAvatar() {
        if (state.avatarOn) return;
        state.avatarOn = true;
        window.__sbAvatar?.show();
        updateOverlayButton('sb-toggle-avatar', true, '👁️ Avatar ON', '👁️ Avatar OFF');
        console.log(PREFIX, 'Avatar enabled.');
    }

    function disableAvatar() {
        if (!state.avatarOn) return;
        state.avatarOn = false;
        window.__sbAvatar?.hide();
        updateOverlayButton('sb-toggle-avatar', false, '👁️ Avatar ON', '👁️ Avatar OFF');
        console.log(PREFIX, 'Avatar disabled.');
    }

    function updateOverlayButton(id, active, onLabel, offLabel) {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.textContent = active ? onLabel : offLabel;
        btn.classList.toggle('active', active);
    }

    // ── Sign Event Handler ────────────────────────
    function onSignDetected(e) {
        const { text, confidence, landmarks } = e.detail;
        if (!text) return;

        console.log(PREFIX, `Sign: "${text}" (conf=${(confidence * 100).toFixed(0)}%)`);

        // Update overlay ticker
        if (window.__sbOverlay) {
            window.__sbOverlay.updateDetection(text, confidence);
            window.__sbOverlay.appendTranscript(text);
        }

        // Accumulate letters into phrases
        accumulatePhrase(text);

        // Feed into recorder transcript
        if (window.__sbRecorder?.isRecording()) {
            window.__sbRecorder.addEntry('sign_user', text);
        }
    }

    // ── Phrase Accumulation (short letters → words) ─
    function accumulatePhrase(text) {
        phraseBuffer.push(text);
        clearTimeout(phraseTimer);

        // If it looks like a multi-word phrase, deliver immediately
        if (text.includes(' ') || text.length > 3) {
            deliverPhrase(text);
            phraseBuffer = [];
            return;
        }

        // Wait for more letters before delivering
        phraseTimer = setTimeout(() => {
            if (phraseBuffer.length > 0) {
                const phrase = phraseBuffer.join('');
                deliverPhrase(phrase);
                phraseBuffer = [];
            }
        }, PHRASE_TIMEOUT);
    }

    function deliverPhrase(phrase) {
        if (!phrase) return;
        console.log(PREFIX, 'Delivering phrase:', phrase);
        if (state.signVoice && window.__sbSpeech) {
            window.__sbSpeech.handle(phrase);
        }
        document.dispatchEvent(new CustomEvent('sb:phraseReady', { detail: phrase }));
    }

    // ── Message Handler ───────────────────────────
    function handleMessage(msg) {
        switch (msg.type) {
            case 'SETTINGS_UPDATE':
                if (msg.settings) {
                    const prev = { ...state };
                    state.signVoice = msg.settings.signVoice ?? state.signVoice;
                    state.voiceSign = msg.settings.voiceSign ?? state.voiceSign;
                    state.record = msg.settings.record ?? state.record;

                    // React to setting changes
                    if (state.signVoice !== prev.signVoice) {
                        state.signVoice ? startDetection() : stopDetection();
                    }
                    if (state.voiceSign !== prev.voiceSign) {
                        state.voiceSign ? enableAvatar() : disableAvatar();
                    }
                    if (state.record !== prev.record) {
                        state.record
                            ? window.__sbRecorder?.start()
                            : window.__sbRecorder?.stop();
                    }
                    applySettings();
                }
                break;

            case 'LOGOUT':
                stopDetection();
                disableAvatar();
                window.__sbRecorder?.stop();
                if (window.__sbOverlay) window.__sbOverlay.hide();
                break;

            case 'AUTH_UPDATE':
                // Re-init if needed
                break;

            case 'WS_STATUS':
                if (msg.status === 'connected' && window.__sbOverlay && state.detecting) {
                    window.__sbOverlay.setStatus(true);
                } else if (msg.status !== 'connected' && window.__sbOverlay) {
                    window.__sbOverlay.setStatus(false, `🔴 WS ${msg.status}`);
                }
                break;

            case 'SIGN_RECOGNITION':
                // Handled by signDetector.js but also relay to UI
                if (window.__sbOverlay) {
                    window.__sbOverlay.updateDetection(msg.text, msg.confidence);
                    window.__sbOverlay.setProcessing(false);
                }
                break;

            default:
                break;
        }
    }

    // ── Run Init ─────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
