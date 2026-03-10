// ════════════════════════════════════════════
// SignBridge — Background Service Worker
// Handles: WebSocket lifecycle, auth token mgmt,
//          tab tracking, and message relay.
// ════════════════════════════════════════════

const WS_URL = 'ws://localhost:8000/ws/sign-recognition';
const MAX_RETRIES = 5;

let ws = null;
let wsRetryCount = 0;
let wsRetryTimer = null;
let authToken = null;
let activeTabId = null;

// ── Startup ──────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
    console.log('[SignBridge] Extension installed / updated.');
    chrome.storage.local.set({ sb_settings: { signVoice: false, voiceSign: false, record: false } });
});

chrome.runtime.onStartup.addListener(() => {
    console.log('[SignBridge] Browser started — service worker waking up.');
    loadTokenAndConnect();
});

// Load token on any wake-up
loadTokenAndConnect();

// ── Auth Token Load ───────────────────────────
function loadTokenAndConnect() {
    chrome.storage.local.get(['sb_token'], (data) => {
        if (data.sb_token) {
            authToken = data.sb_token;
            console.log('[SignBridge] Token loaded, initiating WebSocket.');
            connectWebSocket();
        }
    });
}

// ── WebSocket Manager ─────────────────────────
function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    if (!authToken) {
        console.warn('[SignBridge] No auth token — WebSocket not started.');
        return;
    }

    const url = `${WS_URL}?token=${encodeURIComponent(authToken)}`;
    console.log('[SignBridge] Connecting WebSocket…');

    try {
        ws = new WebSocket(url);
    } catch (err) {
        console.error('[SignBridge] WebSocket construction failed:', err);
        scheduleReconnect();
        return;
    }

    ws.onopen = () => {
        console.log('[SignBridge] WebSocket connected.');
        wsRetryCount = 0;
        clearTimeout(wsRetryTimer);
        broadcastToContent({ type: 'WS_STATUS', status: 'connected' });
    };

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            handleServerMessage(msg);
        } catch (err) {
            console.error('[SignBridge] WS parse error:', err);
        }
    };

    ws.onerror = (err) => {
        console.error('[SignBridge] WebSocket error:', err);
    };

    ws.onclose = (ev) => {
        console.warn(`[SignBridge] WebSocket closed (code=${ev.code}). Reconnecting...`);
        broadcastToContent({ type: 'WS_STATUS', status: 'disconnected' });
        ws = null;
        scheduleReconnect();
    };
}

function scheduleReconnect() {
    if (wsRetryCount >= MAX_RETRIES) {
        console.error('[SignBridge] Max WS retries reached. Giving up.');
        broadcastToContent({ type: 'WS_STATUS', status: 'failed' });
        return;
    }
    const delay = Math.min(1000 * Math.pow(2, wsRetryCount), 30000); // exponential backoff max 30s
    wsRetryCount++;
    console.log(`[SignBridge] Retry #${wsRetryCount} in ${delay}ms`);
    wsRetryTimer = setTimeout(connectWebSocket, delay);
}

function disconnectWebSocket() {
    clearTimeout(wsRetryTimer);
    if (ws) {
        ws.onclose = null; // prevent auto-reconnect on explicit disconnect
        ws.close();
        ws = null;
    }
}

// ── Server Message Router ─────────────────────
function handleServerMessage(msg) {
    switch (msg.type) {
        case 'recognition':
            broadcastToContent({ type: 'SIGN_RECOGNITION', ...msg });
            break;
        case 'avatar_sign':
            broadcastToContent({ type: 'AVATAR_SIGN', ...msg });
            break;
        case 'phrase_ready':
            broadcastToContent({ type: 'PHRASE_READY', text: msg.text });
            break;
        case 'error':
            console.error('[SignBridge] Server error:', msg.message);
            break;
        default:
            console.log('[SignBridge] Unknown server msg:', msg.type);
    }
}

// ── Message Hub (from content / popup) ────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log('[SignBridge BG] Received:', msg.type);

    switch (msg.type) {
        // ── Auth events ──
        case 'AUTH_UPDATE':
            authToken = msg.token;
            disconnectWebSocket();
            connectWebSocket();
            sendResponse({ ok: true });
            break;

        case 'LOGOUT':
            authToken = null;
            disconnectWebSocket();
            sendResponse({ ok: true });
            break;

        // ── Frame relay (content → backend via WS) ──
        case 'SEND_FRAME':
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'frame',
                    data: msg.data,
                    userId: msg.userId,
                    timestamp: msg.timestamp
                }));
                sendResponse({ ok: true });
            } else {
                sendResponse({ ok: false, reason: 'ws_not_connected' });
                connectWebSocket(); // attempt reconnect
            }
            break;

        // ── Settings update ──
        case 'SETTINGS_UPDATE':
            broadcastToContent({ type: 'SETTINGS_UPDATE', settings: msg.settings });
            sendResponse({ ok: true });
            break;

        // ── WS status query ──
        case 'GET_WS_STATUS':
            sendResponse({
                status: ws
                    ? (ws.readyState === WebSocket.OPEN ? 'connected' : 'connecting')
                    : 'disconnected'
            });
            break;

        // ── Ping / health check ──
        case 'PING':
            sendResponse({ pong: true, ts: Date.now() });
            break;

        default:
            sendResponse({ ok: false, reason: 'unknown_type' });
    }

    return true; // keep message channel open for async sendResponse
});

// ── Tab Tracking ──────────────────────────────
chrome.tabs.onActivated.addListener((info) => {
    chrome.tabs.get(info.tabId, (tab) => {
        if (tab && tab.url && tab.url.includes('meet.google.com')) {
            activeTabId = info.tabId;
        }
    });
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === activeTabId) activeTabId = null;
});

// ── Storage Change Listener ───────────────────
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.sb_token) {
        const newToken = changes.sb_token.newValue;
        if (newToken && newToken !== authToken) {
            authToken = newToken;
            disconnectWebSocket();
            connectWebSocket();
        } else if (!newToken) {
            authToken = null;
            disconnectWebSocket();
        }
    }
});

// ── Utilities ─────────────────────────────────
function broadcastToContent(msg) {
    chrome.tabs.query({ url: 'https://meet.google.com/*' }, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, msg).catch(() => {
                // Content script may not be ready yet
            });
        });
    });
}

// ── Alarms (keep service worker alive for WS) ─
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        if (authToken && (!ws || ws.readyState !== WebSocket.OPEN)) {
            console.log('[SignBridge] Keep-alive alarm: reconnecting WS');
            connectWebSocket();
        }
    }
});
