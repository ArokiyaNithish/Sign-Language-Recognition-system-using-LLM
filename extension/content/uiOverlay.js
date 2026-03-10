// ════════════════════════════════════════════
// SignBridge — uiOverlay.js
// Floating control panel injected into Google Meet
// ════════════════════════════════════════════

(function () {
  'use strict';
  if (window.__sbOverlayLoaded) return;
  window.__sbOverlayLoaded = true;

  const PREFIX = '[SignBridge Overlay]';
  let panel = null;
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let isCollapsed = false;

  // ── Create Panel ────────────────────────────
  function createOverlayPanel() {
    if (document.getElementById('sb-overlay-panel')) return;

    const style = document.createElement('style');
    style.id = 'sb-overlay-styles';
    style.textContent = `
      #sb-overlay-panel {
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 280px;
        background: rgba(10,14,26,0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(0,212,255,0.25);
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,212,255,0.08), inset 0 1px 0 rgba(255,255,255,0.05);
        z-index: 999999;
        font-family: 'Inter', 'Segoe UI', sans-serif;
        user-select: none;
        transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
        overflow: hidden;
      }
      #sb-overlay-panel.collapsed { height: 54px !important; }
      #sb-overlay-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        cursor: move;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .sb-logo-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .sb-logo-icon {
        width: 24px;
        height: 24px;
        background: linear-gradient(135deg, #00D4FF, #7C3AED);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
      }
      .sb-title {
        font-size: 13px;
        font-weight: 600;
        background: linear-gradient(90deg, #00D4FF, #7C3AED);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .sb-header-actions { display: flex; gap: 6px; align-items: center; }
      .sb-header-btn {
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(255,255,255,0.1);
        color: #94A3B8;
        border-radius: 6px;
        width: 24px;
        height: 24px;
        font-size: 11px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }
      .sb-header-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
      #sb-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #EF4444;
        box-shadow: 0 0 6px #EF4444;
        flex-shrink: 0;
      }
      #sb-status-dot.active { background: #10B981; box-shadow: 0 0 8px #10B981; animation: sb-pulse 2s infinite; }
      #sb-status-dot.processing { background: #F59E0B; box-shadow: 0 0 6px #F59E0B; animation: sb-pulse 0.8s infinite; }
      @keyframes sb-pulse {
        0%,100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      #sb-overlay-body {
        padding: 10px 14px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
      }
      #sb-overlay-panel.collapsed #sb-overlay-body { display: none; }
      .sb-status-row {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #94A3B8;
        font-size: 11px;
      }
      #sb-status-text { flex: 1; }
      .sb-detection-box {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(0,212,255,0.15);
        border-radius: 10px;
        padding: 8px 10px;
        min-height: 36px;
      }
      .sb-det-label { font-size: 9px; color: #64748B; text-transform: uppercase; letter-spacing: 0.8px; }
      #sb-detected-sign {
        font-size: 16px;
        font-weight: 700;
        color: #00D4FF;
        font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
        min-height: 22px;
        transition: all 0.2s;
      }
      #sb-confidence-bar-wrap {
        height: 3px;
        background: rgba(255,255,255,0.06);
        border-radius: 2px;
        margin-top: 4px;
        overflow: hidden;
      }
      #sb-confidence-bar {
        height: 100%;
        background: linear-gradient(90deg, #00D4FF, #7C3AED);
        border-radius: 2px;
        width: 0%;
        transition: width 0.4s ease;
      }
      .sb-transcript-box {
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px;
        padding: 6px 10px;
        overflow: hidden;
      }
      .sb-det-label { font-size: 9px; color: #64748B; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 3px; }
      #sb-transcript-ticker {
        font-size: 11px;
        color: #64748B;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }
      .sb-quick-btns {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
      }
      .sb-quick-btn {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
        color: #94A3B8;
        border-radius: 8px;
        padding: 7px 10px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s;
        text-align: center;
      }
      .sb-quick-btn:hover { background: rgba(0,212,255,0.1); color: #00D4FF; border-color: rgba(0,212,255,0.3); }
      .sb-quick-btn.active { background: rgba(0,212,255,0.15); color: #00D4FF; border-color: rgba(0,212,255,0.4); }
    `;
    document.head.appendChild(style);

    panel = document.createElement('div');
    panel.id = 'sb-overlay-panel';
    panel.innerHTML = `
      <div id="sb-overlay-header">
        <div class="sb-logo-row">
          <div class="sb-logo-icon">🤟</div>
          <span class="sb-title">SignBridge</span>
        </div>
        <div class="sb-header-actions">
          <div id="sb-status-dot"></div>
          <button class="sb-header-btn" id="sb-collapse-btn" title="Collapse">−</button>
          <button class="sb-header-btn" id="sb-close-btn" title="Close">×</button>
        </div>
      </div>
      <div id="sb-overlay-body">
        <div class="sb-status-row">
          <span id="sb-status-text">🔴 Sign Detection Inactive</span>
        </div>
        <div class="sb-detection-box">
          <div class="sb-det-label">Last Detected Sign</div>
          <div id="sb-detected-sign">—</div>
          <div id="sb-confidence-bar-wrap"><div id="sb-confidence-bar"></div></div>
        </div>
        <div class="sb-transcript-box">
          <div class="sb-det-label">Live Transcript</div>
          <div id="sb-transcript-ticker">Waiting for signs...</div>
        </div>
        <div class="sb-quick-btns">
          <button class="sb-quick-btn" id="sb-toggle-detect" onclick="window.__sbToggleDetect()">🤟 Detect ON</button>
          <button class="sb-quick-btn" id="sb-toggle-avatar" onclick="window.__sbToggleAvatar()">👁️ Avatar</button>
          <button class="sb-quick-btn" id="sb-toggle-record" onclick="window.__sbToggleRecord()">⏺ Record</button>
          <button class="sb-quick-btn" id="sb-toggle-tts" onclick="window.__sbToggleTTS()">🔊 TTS</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    bindDrag();
    bindButtons();

    console.log(PREFIX, 'Overlay panel created.');
  }

  // ── Drag ────────────────────────────────────
  function bindDrag() {
    const header = document.getElementById('sb-overlay-header');
    header.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('sb-header-btn')) return;
      isDragging = true;
      const rect = panel.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      panel.style.transition = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const x = e.clientX - dragOffsetX;
      const y = e.clientY - dragOffsetY;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = `${Math.max(0, Math.min(x, window.innerWidth - panel.offsetWidth))}px`;
      panel.style.top = `${Math.max(0, Math.min(y, window.innerHeight - panel.offsetHeight))}px`;
    });
    document.addEventListener('mouseup', () => {
      isDragging = false;
      panel.style.transition = 'all 0.3s cubic-bezier(0.4,0,0.2,1)';
    });
  }

  // ── Button Actions ───────────────────────────
  function bindButtons() {
    document.getElementById('sb-collapse-btn').onclick = () => {
      isCollapsed = !isCollapsed;
      panel.classList.toggle('collapsed', isCollapsed);
      document.getElementById('sb-collapse-btn').textContent = isCollapsed ? '+' : '−';
    };
    document.getElementById('sb-close-btn').onclick = () => {
      panel.style.display = 'none';
    };
  }

  // ── Public API (called from content.js) ───────
  window.__sbOverlay = {
    create: createOverlayPanel,

    setStatus(active, text) {
      const dot = document.getElementById('sb-status-dot');
      const txt = document.getElementById('sb-status-text');
      if (dot) dot.className = active ? 'active' : '';
      if (txt) txt.textContent = active ? '🟢 Sign Detection Active' : (text || '🔴 Inactive');
    },

    updateDetection(sign, confidence) {
      const el = document.getElementById('sb-detected-sign');
      const bar = document.getElementById('sb-confidence-bar');
      if (el) {
        el.textContent = sign || '—';
        el.style.color = '#00D4FF';
        setTimeout(() => { if (el) el.style.color = '#94A3B8'; }, 800);
      }
      if (bar) bar.style.width = `${Math.round((confidence || 0) * 100)}%`;
    },

    appendTranscript(text) {
      const el = document.getElementById('sb-transcript-ticker');
      if (!el) return;
      el.textContent = text;
    },

    setProcessing(processing) {
      const dot = document.getElementById('sb-status-dot');
      if (dot) dot.className = processing ? 'processing' : 'active';
    },

    show() { if (panel) panel.style.display = ''; },
    hide() { if (panel) panel.style.display = 'none'; },
  };

  // Toggle stubs (content.js will override these)
  window.__sbToggleDetect = () => document.dispatchEvent(new CustomEvent('sb:toggle', { detail: 'detect' }));
  window.__sbToggleAvatar = () => document.dispatchEvent(new CustomEvent('sb:toggle', { detail: 'avatar' }));
  window.__sbToggleRecord = () => document.dispatchEvent(new CustomEvent('sb:toggle', { detail: 'record' }));
  window.__sbToggleTTS = () => document.dispatchEvent(new CustomEvent('sb:toggle', { detail: 'tts' }));

  console.log(PREFIX, 'uiOverlay.js loaded.');
})();
