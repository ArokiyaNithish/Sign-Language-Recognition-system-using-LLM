// uiOverlay.js - Handles the floating control panel injected into Google Meet

class SignBridgeUI {
    constructor() {
        this.container = null;
        this.avatarCanvas = null;
        this.ticker = null;
        this.statusText = null;
        this.statusDot = null;
        this.ctx = null;

        // UI state
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.isExpanded = true;

        this.init();
    }

    init() {
        // Create main container
        this.container = document.createElement('div');
        this.container.id = 'signbridge-overlay';
        this.applyStyles(this.container, {
            position: 'fixed',
            bottom: '100px',
            right: '24px',
            width: '280px',
            backgroundColor: 'rgba(10, 14, 26, 0.85)',
            backdropFilter: 'blur(12px)',
            '-webkit-backdrop-filter': 'blur(12px)',
            border: '1px solid rgba(0, 212, 255, 0.2)',
            borderRadius: '16px',
            color: '#ffffff',
            fontFamily: '"Inter", sans-serif',
            zIndex: '999999',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            overflow: 'hidden',
            transition: 'height 0.3s ease, width 0.3s ease',
            display: 'flex',
            flexDirection: 'column'
        });

        // Create Header (Draggable)
        const header = document.createElement('div');
        this.applyStyles(header, {
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            cursor: 'move',
            userSelect: 'none',
            background: 'linear-gradient(90deg, rgba(0,212,255,0.05), rgba(124,58,237,0.05))'
        });

        const titleGroup = document.createElement('div');
        this.applyStyles(titleGroup, { display: 'flex', alignItems: 'center', gap: '8px' });

        // Status Dot
        this.statusDot = document.createElement('div');
        this.applyStyles(this.statusDot, {
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#EF4444',
            boxShadow: '0 0 8px #EF4444',
            transition: 'background-color 0.3s, box-shadow 0.3s'
        });

        this.statusText = document.createElement('span');
        this.statusText.textContent = 'SignBridge Offline';
        this.applyStyles(this.statusText, {
            fontSize: '13px',
            fontWeight: '600',
            letterSpacing: '0.5px'
        });

        // Collapse Button
        const collapseBtn = document.createElement('button');
        collapseBtn.innerHTML = '−'; // minus sign
        this.applyStyles(collapseBtn, {
            background: 'none',
            border: 'none',
            color: '#9CA3AF',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '0 4px',
            lineHeight: '1'
        });

        titleGroup.appendChild(this.statusDot);
        titleGroup.appendChild(this.statusText);
        header.appendChild(titleGroup);
        header.appendChild(collapseBtn);
        this.container.appendChild(header);

        // Body container
        this.body = document.createElement('div');
        this.applyStyles(this.body, {
            display: 'flex',
            flexDirection: 'column',
            padding: '12px'
        });

        // Avatar Canvas (Mini)
        this.avatarCanvas = document.createElement('canvas');
        this.avatarCanvas.width = 256;
        this.avatarCanvas.height = 200;
        this.applyStyles(this.avatarCanvas, {
            width: '100%',
            height: '160px',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '8px',
            marginBottom: '12px',
            display: 'block'
        });
        this.ctx = this.avatarCanvas.getContext('2d');
        this.body.appendChild(this.avatarCanvas);

        // Live Ticker Window
        const tickerContainer = document.createElement('div');
        this.applyStyles(tickerContainer, {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '8px',
            padding: '10px',
            minHeight: '60px',
            maxHeight: '100px',
            overflowY: 'auto'
        });

        const tickerLabel = document.createElement('div');
        tickerLabel.textContent = 'LIVE TRANSCRIPTION';
        this.applyStyles(tickerLabel, {
            fontSize: '10px',
            color: '#00D4FF',
            fontWeight: '700',
            letterSpacing: '1px',
            marginBottom: '4px'
        });

        this.ticker = document.createElement('div');
        this.applyStyles(this.ticker, {
            fontSize: '14px',
            lineHeight: '1.4',
            color: '#ffffff',
            wordWrap: 'break-word',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
        });

        tickerContainer.appendChild(tickerLabel);
        tickerContainer.appendChild(this.ticker);
        this.body.appendChild(tickerContainer);

        // Add to container
        this.container.appendChild(this.body);

        // Append to document
        document.body.appendChild(this.container);

        // Setup event listeners
        this.setupDragging(header);
        this.setupCollapse(collapseBtn);
    }

    applyStyles(element, styles) {
        for (const [key, value] of Object.entries(styles)) {
            element.style[key] = value;
        }
    }

    setupDragging(header) {
        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName !== 'BUTTON') {
                this.isDragging = true;
                const rect = this.container.getBoundingClientRect();
                this.dragOffset.x = e.clientX - rect.left;
                this.dragOffset.y = e.clientY - rect.top;
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const x = e.clientX - this.dragOffset.x;
            const y = e.clientY - this.dragOffset.y;

            // Boundary checks
            const maxX = window.innerWidth - this.container.offsetWidth;
            const maxY = window.innerHeight - this.container.offsetHeight;

            this.container.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
            this.container.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
            this.container.style.right = 'auto'; // Clear right since we use left/top for dragging
            this.container.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            this.isDragging = false;
        });
    }

    setupCollapse(btn) {
        btn.addEventListener('click', () => {
            this.isExpanded = !this.isExpanded;
            if (this.isExpanded) {
                this.body.style.display = 'flex';
                btn.innerHTML = '−';
            } else {
                this.body.style.display = 'none';
                btn.innerHTML = '+';
            }
        });
    }

    setConnectionStatus(connected) {
        if (connected) {
            this.statusDot.style.backgroundColor = '#10B981';
            this.statusDot.style.boxShadow = '0 0 8px #10B981';
            this.statusText.textContent = '🟢 Active';
        } else {
            this.statusDot.style.backgroundColor = '#EF4444';
            this.statusDot.style.boxShadow = '0 0 8px #EF4444';
            this.statusText.textContent = '🔴 Disconnected';
        }
    }

    addTranscriptItem(text, isSelf = true, confidence = null) {
        const item = document.createElement('div');

        // Style differently based on speaker
        if (isSelf) {
            this.applyStyles(item, {
                color: '#00D4FF', // Teal for user's signs
                paddingLeft: '8px',
                borderLeft: '2px solid #00D4FF'
            });
        } else {
            this.applyStyles(item, {
                color: '#FFFFFF', // White for others' speech
            });
        }

        let confHtml = '';
        if (confidence && confidence > 0) {
            const color = confidence > 0.85 ? '#10B981' : (confidence > 0.7 ? '#F59E0B' : '#EF4444');
            confHtml = `<span style="font-size:10px; color:${color}; margin-left:6px;">${(confidence * 100).toFixed(0)}%</span>`;
        }

        item.innerHTML = `<span>${text}</span>${confHtml}`;
        this.ticker.appendChild(item);

        // Auto scroll down
        this.ticker.parentElement.scrollTop = this.ticker.parentElement.scrollHeight;

        // Keep only last 10 items
        if (this.ticker.children.length > 10) {
            this.ticker.removeChild(this.ticker.firstChild);
        }
    }

    getCanvasContext() {
        return this.ctx;
    }
}

// Export for content script
window.SignBridgeUI = SignBridgeUI;
