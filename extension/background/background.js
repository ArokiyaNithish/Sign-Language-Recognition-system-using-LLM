// background.js - Service Worker for Extension
console.log('[SignBridge] Background service worker initialized');

// App State
let state = {
    token: null,
    settings: {
        signToVoice: true,
        voiceToSign: true,
        recordMeeting: false
    },
    wsConnected: false,
    activeMeetingTab: null,
    stats: {
        signsCount: 0,
        wordsCount: 0,
        avgConfidence: 0,
        ping: 0
    }
};

let websocket = null;
let reconnectAttempts = 0;
const MAX_RECONNECTS = 5;

// Load stored data
chrome.storage.local.get(['signbridge_token', 'signbridge_settings'], (result) => {
    if (result.signbridge_token) {
        state.token = result.signbridge_token;
    }
    if (result.signbridge_settings) {
        state.settings = { ...state.settings, ...result.signbridge_settings };
    }
});

// Message Listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log('[SignBridge] Received message:', msg.type);

    switch (msg.type) {
        case 'AUTH_SUCCESS':
            state.token = msg.token;
            // Re-connect to WS if we are in a meeting tab
            if (state.activeMeetingTab) {
                connectWebSocket();
            }
            sendResponse({ success: true });
            break;

        case 'LOGOUT':
            state.token = null;
            disconnectWebSocket();
            sendResponse({ success: true });
            break;

        case 'SETTINGS_UPDATED':
            state.settings = msg.settings;
            // Broadcast settings to content script
            if (state.activeMeetingTab) {
                chrome.tabs.sendMessage(state.activeMeetingTab, {
                    type: 'UPDATE_SETTINGS',
                    settings: state.settings
                });
            }
            sendResponse({ success: true });
            break;

        case 'GET_STATS':
            sendResponse({
                connected: state.wsConnected,
                ...state.stats
            });
            break;

        case 'MEET_JOINED':
            console.log('[SignBridge] Meet joined in tab', sender.tab.id);
            state.activeMeetingTab = sender.tab.id;
            // Reset stats
            state.stats = { signsCount: 0, wordsCount: 0, avgConfidence: 0, ping: 0 };
            if (state.token) {
                connectWebSocket();
            }
            sendResponse({ settings: state.settings });
            break;

        case 'MEET_LEFT':
            console.log('[SignBridge] Meet left');
            state.activeMeetingTab = null;
            disconnectWebSocket();
            sendResponse({ success: true });
            break;

        case 'SEND_FRAME':
            if (state.wsConnected && websocket.readyState === WebSocket.OPEN) {
                websocket.send(JSON.stringify({
                    type: 'frame',
                    data: msg.frame,
                    timestamp: Date.now()
                }));
            }
            break;
    }

    // Return true to indicate we will send a response asynchronously 
    // if needed, though we send sync responses above.
    return true;
});

// WebSocket Management
function connectWebSocket() {
    if (websocket && websocket.readyState !== WebSocket.CLOSED) {
        console.log('[SignBridge] WS already connected/connecting');
        return;
    }

    if (!state.token) {
        console.error('[SignBridge] Cannot connect WS: No token');
        return;
    }

    const wsUrl = `ws://localhost:8000/ws/sign-recognition?token=${state.token}`;
    console.log('[SignBridge] Connecting to WS...');

    try {
        websocket = new WebSocket(wsUrl);

        websocket.onopen = () => {
            console.log('[SignBridge] WS Connected');
            state.wsConnected = true;
            reconnectAttempts = 0;

            // Notify content script
            if (state.activeMeetingTab) {
                chrome.tabs.sendMessage(state.activeMeetingTab, {
                    type: 'WS_STATUS',
                    connected: true
                });
            }
        };

        websocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWsMessage(data);
            } catch (e) {
                console.error('[SignBridge] WS JSON parse error:', e);
            }
        };

        websocket.onclose = () => {
            console.log('[SignBridge] WS Disconnected');
            state.wsConnected = false;

            if (state.activeMeetingTab) {
                chrome.tabs.sendMessage(state.activeMeetingTab, {
                    type: 'WS_STATUS',
                    connected: false
                });
            }

            // Try reconnect
            if (state.activeMeetingTab && reconnectAttempts < MAX_RECONNECTS) {
                const timeout = Math.pow(2, reconnectAttempts) * 1000;
                reconnectAttempts++;
                console.log(`[SignBridge] Reconnecting in ${timeout}ms (Attempt ${reconnectAttempts})`);
                setTimeout(connectWebSocket, timeout);
            }
        };

        websocket.onerror = (error) => {
            console.error('[SignBridge] WS Error:', error);
        };
    } catch (error) {
        console.warn('[SignBridge] WS Connection failed (maybe backend is offline):', error);
    }
}

function disconnectWebSocket() {
    if (websocket) {
        websocket.close();
        websocket = null;
    }
    state.wsConnected = false;
    reconnectAttempts = 0;
}

function handleWsMessage(data) {
    // Pass relevant events down to content script
    if (data.type === 'recognition' || data.type === 'avatar_sign') {
        if (data.type === 'recognition') {
            // Update stats
            state.stats.signsCount++;
            if (data.text.includes(' ')) {
                // approximate words
                state.stats.wordsCount += data.text.split(' ').length;
            } else {
                state.stats.wordsCount++;
            }

            // Moving average for confidence
            if (data.confidence) {
                state.stats.avgConfidence = (state.stats.avgConfidence * 0.9) + (data.confidence * 0.1);
            }
        }

        if (state.activeMeetingTab) {
            chrome.tabs.sendMessage(state.activeMeetingTab, data);
        }
    } else if (data.type === 'pong') {
        state.stats.ping = Date.now() - data.timestamp;
    }
}

// Keep Service Worker Alive
// Chrome M3+ service workers terminate after 30s of inactivity.
// We ping the WS or use alarms to keep it alive during a meeting.
chrome.alarms.create('keepAlive', { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive' && state.wsConnected && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
    }
});
