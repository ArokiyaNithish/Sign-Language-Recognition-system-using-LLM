// ════════════════════════════════════════════
// SignBridge — meetingRecorder.js
// Tab audio/video capture + transcript accumulator
// Sends transcript to backend for AI summary
// ════════════════════════════════════════════

(function () {
    'use strict';
    if (window.__sbRecorderLoaded) return;
    window.__sbRecorderLoaded = true;

    const PREFIX = '[SignBridge Recorder]';
    const API_BASE = 'http://localhost:8000/api';
    const CHUNK_INTERVAL_MS = 5000; // 5 second recording chunks

    let mediaRecorder = null;
    let recordedChunks = [];
    let transcript = [];
    let isRecording = false;
    let meetingId = null;
    let authToken = null;
    let startTime = null;

    // ── Load Auth ────────────────────────────────
    async function loadAuth() {
        return new Promise(resolve => {
            chrome.storage.local.get(['sb_token'], (data) => {
                authToken = data.sb_token || null;
                resolve();
            });
        });
    }

    // ── Start Recording ───────────────────────────
    async function startRecording() {
        if (isRecording) return;
        await loadAuth();
        if (!authToken) {
            console.warn(PREFIX, 'No auth token — recording not started.');
            return;
        }

        meetingId = `meeting_${Date.now()}`;
        startTime = Date.now();
        recordedChunks = [];
        transcript = [];

        try {
            // Capture the current tab's audio stream
            const stream = await getTabAudioStream();
            if (!stream) {
                console.warn(PREFIX, 'Tab capture stream unavailable — recording transcript-only.');
                isRecording = true;
                console.log(PREFIX, `Recording started (transcript-only) [id=${meetingId}]`);
                return;
            }

            const mimeType = getSupportedMimeType();
            mediaRecorder = new MediaRecorder(stream, { mimeType });

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) recordedChunks.push(e.data);
            };

            mediaRecorder.onerror = (e) => {
                console.error(PREFIX, 'MediaRecorder error:', e.error);
            };

            mediaRecorder.onstop = () => {
                handleRecordingStop();
            };

            mediaRecorder.start(CHUNK_INTERVAL_MS);
            isRecording = true;
            console.log(PREFIX, `Recording started [id=${meetingId}] [mimeType=${mimeType}]`);

        } catch (err) {
            console.error(PREFIX, 'Failed to start recording:', err.message);
            // Fall back to transcript-only mode
            isRecording = true;
        }
    }

    function getSupportedMimeType() {
        const types = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'audio/webm;codecs=opus',
            'audio/webm'
        ];
        return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
    }

    async function getTabAudioStream() {
        return new Promise((resolve) => {
            // Request tab capture via background script
            chrome.runtime.sendMessage({ type: 'REQUEST_TAB_CAPTURE' }, (resp) => {
                if (chrome.runtime.lastError || !resp || !resp.streamId) {
                    resolve(null);
                    return;
                }
                navigator.mediaDevices.getUserMedia({
                    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: resp.streamId } },
                    video: false
                })
                    .then(resolve)
                    .catch((err) => {
                        console.warn(PREFIX, 'Tab audio stream error:', err.message);
                        resolve(null);
                    });
            });
        });
    }

    // ── Stop Recording ────────────────────────────
    async function stopRecording() {
        if (!isRecording) return;
        isRecording = false;

        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop(); // triggers onstop → handleRecordingStop
        } else {
            await handleRecordingStop();
        }
    }

    async function handleRecordingStop() {
        console.log(PREFIX, `Recording stopped [${transcript.length} transcript entries]`);
        const duration = Math.round((Date.now() - startTime) / 1000);

        // Send transcript to backend for AI summary
        if (transcript.length > 0) {
            await sendForSummary(duration);
        }
    }

    // ── Transcript Accumulation ───────────────────
    function addTranscriptEntry(speaker, text) {
        if (!text) return;
        transcript.push({
            timestamp: new Date().toISOString(),
            elapsed: startTime ? Math.round((Date.now() - startTime) / 1000) : 0,
            speaker,
            text
        });
    }

    // ── Send for Summary ─────────────────────────
    async function sendForSummary(duration) {
        try {
            console.log(PREFIX, 'Sending transcript to backend for summarization…');
            const response = await fetch(`${API_BASE}/meeting/summarize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    meeting_id: meetingId,
                    transcript,
                    duration_seconds: duration
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Summarization failed');
            }

            const result = await response.json();
            console.log(PREFIX, 'Summary received:', result);

            // Notify content.js and popup
            document.dispatchEvent(new CustomEvent('sb:meetingEnded', {
                detail: { meetingId, summary: result }
            }));
            chrome.runtime.sendMessage({
                type: 'MEETING_ENDED',
                meeting_id: meetingId,
                summary: result
            }).catch(() => { });

        } catch (err) {
            console.error(PREFIX, 'Summary request failed:', err.message);
        }
    }

    // ── External API ─────────────────────────────
    window.__sbRecorder = {
        start: startRecording,
        stop: stopRecording,
        addEntry: addTranscriptEntry,
        isRecording: () => isRecording,
        getMeetingId: () => meetingId,
        getTranscript: () => [...transcript],
        clearTranscript: () => { transcript = []; }
    };

    // Listen for messages
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'SETTINGS_UPDATE' && msg.settings) {
            if (msg.settings.record && !isRecording) startRecording();
            if (!msg.settings.record && isRecording) stopRecording();
        }
        if (msg.type === 'AUTH_UPDATE') authToken = msg.token;
    });

    // Listen for detected signs to add to transcript
    document.addEventListener('sb:signDetected', (e) => {
        if (isRecording) addTranscriptEntry('sign_user', e.detail.text);
    });
    document.addEventListener('sb:phraseReady', (e) => {
        if (isRecording) addTranscriptEntry('sign_user', e.detail);
    });

    console.log(PREFIX, 'meetingRecorder.js loaded.');
})();
