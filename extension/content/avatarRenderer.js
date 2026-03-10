// ════════════════════════════════════════════
// SignBridge — avatarRenderer.js
// Canvas-based sign language avatar panel
// ════════════════════════════════════════════

(function () {
    'use strict';
    if (window.__sbAvatarLoaded) return;
    window.__sbAvatarLoaded = true;

    const PREFIX = '[SignBridge Avatar]';
    const CANVAS_W = 200;
    const CANVAS_H = 300;
    const ANIM_DURATION = 300; // ms

    let panel = null;
    let canvas = null;
    let ctx = null;
    let isVisible = false;

    // Current and target hand positions (normalized 0-1)
    let currentLeft = null;
    let currentRight = null;
    let targetLeft = null;
    let targetRight = null;
    let animStart = null;
    let animFrame = null;
    let currentSign = '—';

    // ── Create Panel ────────────────────────────
    function createAvatarPanel() {
        if (document.getElementById('sb-avatar-panel')) return;

        const style = document.createElement('style');
        style.textContent = `
      #sb-avatar-panel {
        position: fixed;
        bottom: 395px;
        right: 20px;
        width: ${CANVAS_W + 16}px;
        background: rgba(10,14,26,0.9);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(0,212,255,0.3);
        border-radius: 14px;
        padding: 8px;
        z-index: 999998;
        display: none;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        box-shadow: 0 0 30px rgba(0,212,255,0.1), 0 8px 32px rgba(0,0,0,0.5);
      }
      #sb-avatar-panel.visible { display: flex; }
      #sb-avatar-label {
        font-size: 9px;
        color: rgba(0,212,255,0.6);
        text-transform: uppercase;
        letter-spacing: 1.5px;
        font-family: 'Inter', sans-serif;
        width: 100%;
        text-align: center;
      }
      #sb-avatar-canvas {
        border-radius: 10px;
        display: block;
      }
      #sb-avatar-sign-badge {
        font-size: 13px;
        font-weight: 700;
        color: #00D4FF;
        font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
        letter-spacing: 1px;
      }
    `;
        document.head.appendChild(style);

        panel = document.createElement('div');
        panel.id = 'sb-avatar-panel';
        panel.innerHTML = `
      <div id="sb-avatar-label">Live Avatar</div>
      <canvas id="sb-avatar-canvas" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
      <div id="sb-avatar-sign-badge">—</div>
    `;
        document.body.appendChild(panel);

        canvas = document.getElementById('sb-avatar-canvas');
        ctx = canvas.getContext('2d');

        drawIdleAvatar();
        console.log(PREFIX, 'Avatar panel created.');
    }

    // ── Show / Hide ──────────────────────────────
    function show() {
        if (!panel) createAvatarPanel();
        isVisible = true;
        panel.classList.add('visible');
    }
    function hide() {
        isVisible = false;
        if (panel) panel.classList.remove('visible');
        if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    }

    // ── Draw Idle Avatar ─────────────────────────
    function drawIdleAvatar() {
        if (!ctx) return;
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

        // Dark gradient background
        const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        bg.addColorStop(0, '#0d1220');
        bg.addColorStop(1, '#070a12');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Subtle grid
        ctx.strokeStyle = 'rgba(0,212,255,0.04)';
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= CANVAS_W; x += 20) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
        }
        for (let y = 0; y <= CANVAS_H; y += 20) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
        }

        // Head
        ctx.fillStyle = '#1e2a3a';
        ctx.beginPath();
        ctx.ellipse(CANVAS_W / 2, 55, 28, 32, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,212,255,0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Neck
        ctx.fillStyle = '#1e2a3a';
        ctx.fillRect(CANVAS_W / 2 - 8, 84, 16, 20);

        // Torso
        const torsoGrad = ctx.createLinearGradient(60, 102, 140, 200);
        torsoGrad.addColorStop(0, '#1a2744');
        torsoGrad.addColorStop(1, '#111827');
        ctx.fillStyle = torsoGrad;
        ctx.beginPath();
        ctx.moveTo(60, 104);
        ctx.quadraticCurveTo(50, 175, 55, 210);
        ctx.lineTo(145, 210);
        ctx.quadraticCurveTo(150, 175, 140, 104);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(124,58,237,0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Arms at rest
        drawArm(ctx, 65, 115, 40, 185, 'rgba(0,212,255,0.6)'); // left
        drawArm(ctx, 135, 115, 160, 185, 'rgba(0,212,255,0.6)'); // right
        drawHand(ctx, 40, 185, false);
        drawHand(ctx, 160, 185, false);
    }

    function drawArm(ctx, x1, y1, x2, y2, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + 10, x2, y2);
        ctx.stroke();
    }

    // ── Draw Hand (schematic) ────────────────────
    function drawHand(ctx, cx, cy, glowing, color = 'rgba(0,212,255,0.7)') {
        if (glowing) {
            ctx.shadowColor = '#00D4FF';
            ctx.shadowBlur = 15;
        }

        // Palm
        ctx.fillStyle = 'rgba(30,42,58,0.9)';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, 10, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Fingers
        const fingerAngles = [-0.4, -0.15, 0.05, 0.25, 0.45];
        const fingerLen = [20, 24, 22, 18, 14];
        fingerAngles.forEach((angle, i) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(cx + Math.sin(angle) * 8, cy - Math.cos(angle) * 8);
            ctx.lineTo(cx + Math.sin(angle) * (8 + fingerLen[i]), cy - Math.cos(angle) * (8 + fingerLen[i]));
            ctx.stroke();
        });

        ctx.shadowBlur = 0;
    }

    // ── Animated Sign Rendering ───────────────────
    function animateToLandmarks(leftLandmarks, rightLandmarks, sign) {
        if (!ctx) return;
        targetLeft = leftLandmarks;
        targetRight = rightLandmarks;
        currentSign = sign;
        animStart = null;

        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = requestAnimationFrame(animTick);
    }

    function animTick(timestamp) {
        if (!animStart) animStart = timestamp;
        const elapsed = timestamp - animStart;
        const t = Math.min(elapsed / ANIM_DURATION, 1);
        const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

        // Interpolate if we have previous positions
        const left = interpolateLandmarks(currentLeft, targetLeft, ease);
        const right = interpolateLandmarks(currentRight, targetRight, ease);

        renderAvatar(left, right, sign, ease);

        if (t < 1) {
            animFrame = requestAnimationFrame(animTick);
        } else {
            currentLeft = targetLeft;
            currentRight = targetRight;
            animFrame = null;
        }
    }

    function interpolateLandmarks(from, to, t) {
        if (!from) return to;
        if (!to) return from;
        return to.map((pt, i) => ({
            x: (from[i]?.x ?? pt.x) + ((pt.x) - (from[i]?.x ?? pt.x)) * t,
            y: (from[i]?.y ?? pt.y) + ((pt.y) - (from[i]?.y ?? pt.y)) * t
        }));
    }

    function renderAvatar(leftLandmarks, rightLandmarks, sign, progress) {
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        drawIdleAvatar();

        // Render landmark-driven hands if available
        if (rightLandmarks && rightLandmarks.length >= 5) {
            drawLandmarkHand(ctx, rightLandmarks, 130, 130, '#00D4FF', progress);
        }
        if (leftLandmarks && leftLandmarks.length >= 5) {
            drawLandmarkHand(ctx, leftLandmarks, 70, 130, '#7C3AED', progress);
        }

        // Update sign badge
        const badge = document.getElementById('sb-avatar-sign-badge');
        if (badge) badge.textContent = sign || '—';
    }

    function drawLandmarkHand(ctx, landmarks, baseX, baseY, color, alpha = 1) {
        if (!landmarks || landmarks.length === 0) return;

        ctx.shadowColor = color;
        ctx.shadowBlur = 12 * alpha;
        ctx.strokeStyle = color.replace(')', `,${alpha})`).replace('rgb', 'rgba');
        ctx.fillStyle = `rgba(10,14,26,0.8)`;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        const SCALE = 60;
        const pts = landmarks.map(lm => ({
            x: baseX + (lm.x - 0.5) * SCALE,
            y: baseY + (lm.y - 0.5) * SCALE
        }));

        // Finger connections (MediaPipe hand topology)
        const CONNECTIONS = [
            [0, 1], [1, 2], [2, 3], [3, 4],     // thumb
            [0, 5], [5, 6], [6, 7], [7, 8],     // index
            [0, 9], [9, 10], [10, 11], [11, 12], // middle
            [0, 13], [13, 14], [14, 15], [15, 16], // ring
            [0, 17], [17, 18], [18, 19], [19, 20], // pinky
            [5, 9], [9, 13], [13, 17]          // palm
        ];

        CONNECTIONS.forEach(([a, b]) => {
            if (!pts[a] || !pts[b]) return;
            ctx.beginPath();
            ctx.moveTo(pts[a].x, pts[a].y);
            ctx.lineTo(pts[b].x, pts[b].y);
            ctx.stroke();
        });

        // Joint dots
        pts.forEach((pt, i) => {
            ctx.fillStyle = i === 0 ? '#fff' : color;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, i === 0 ? 4 : 2.5, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.shadowBlur = 0;
    }

    // ── External API ─────────────────────────────
    window.__sbAvatar = {
        create: createAvatarPanel,
        show,
        hide,
        render: animateToLandmarks,
        isVisible: () => isVisible
    };

    // Listen for avatar sign events
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type !== 'AVATAR_SIGN') return;
        if (!isVisible) return;
        const { sign, landmarks } = msg;
        animateToLandmarks(
            landmarks?.left_hand ? landmarks.left_hand.map(([x, y, z]) => ({ x, y, z })) : null,
            landmarks?.right_hand ? landmarks.right_hand.map(([x, y, z]) => ({ x, y, z })) : null,
            sign
        );
    });

    document.addEventListener('sb:avatarSign', (e) => {
        const { sign, leftLandmarks, rightLandmarks } = e.detail;
        if (isVisible) animateToLandmarks(leftLandmarks, rightLandmarks, sign);
    });

    console.log(PREFIX, 'avatarRenderer.js loaded.');
})();
