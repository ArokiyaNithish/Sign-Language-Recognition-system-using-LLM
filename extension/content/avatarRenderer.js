// avatarRenderer.js - Draws a 2D sign language avatar using canvas and landmarks

class AvatarRenderer {
    constructor(ctx) {
        this.ctx = ctx;
        this.width = ctx.canvas.width;
        this.height = ctx.canvas.height;

        this.currentLandmarks = null;
        this.targetLandmarks = null;
        this.animating = false;

        // Simple spring physics animation properties
        this.stiffness = 0.2;
        this.damping = 0.7;
        this.velocity = {}; // Store velocity for each landmark

        // Draw initial idle pose
        this.clear();
    }

    // Draw the torso and head of the avatar (static)
    drawSilhouette() {
        this.ctx.fillStyle = 'rgba(10, 14, 26, 1)';
        this.ctx.fillRect(0, 0, this.width, this.height);

        const centerX = this.width / 2;
        const centerY = this.height / 2;

        // Add grid/glow effect
        this.ctx.strokeStyle = 'rgba(0, 212, 255, 0.05)';
        this.ctx.lineWidth = 1;
        for (let i = 0; i < this.width; i += 20) {
            this.ctx.beginPath(); this.ctx.moveTo(i, 0); this.ctx.lineTo(i, this.height); this.ctx.stroke();
        }
        for (let i = 0; i < this.height; i += 20) {
            this.ctx.beginPath(); this.ctx.moveTo(0, i); this.ctx.lineTo(this.width, i); this.ctx.stroke();
        }

        this.ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
        this.ctx.fillStyle = 'transparent';
        this.ctx.lineWidth = 2;

        // Head
        this.ctx.beginPath();
        this.ctx.arc(centerX, 50, 25, 0, Math.PI * 2);
        this.ctx.stroke();

        // Body/Shoulders
        this.ctx.beginPath();
        this.ctx.moveTo(centerX - 40, 90);
        this.ctx.quadraticCurveTo(centerX, 85, centerX + 40, 90);
        this.ctx.lineTo(centerX + 60, this.height);
        this.ctx.lineTo(centerX - 60, this.height);
        this.ctx.closePath();
        this.ctx.stroke();

        // Fill with slight gradient
        const grad = this.ctx.createLinearGradient(0, 80, 0, this.height);
        grad.addColorStop(0, 'rgba(0, 212, 255, 0.05)');
        grad.addColorStop(1, 'rgba(124, 58, 237, 0.15)');
        this.ctx.fillStyle = grad;
        this.ctx.fill();
    }

    // Expects { left_hand: [[x,y,z]*21], right_hand: [[x,y,z]*21] }
    // Coordinates should be normalized 0-1
    renderHands(landmarks) {
        if (!landmarks) return;

        // Map normalized coordinates to canvas space
        this.targetLandmarks = this.scaleLandmarks(landmarks);

        if (!this.currentLandmarks) {
            this.currentLandmarks = JSON.parse(JSON.stringify(this.targetLandmarks));
            this.initVelocities();
        }

        if (!this.animating) {
            this.animating = true;
            this.animate();
        }
    }

    scaleLandmarks(landmarks) {
        const scaled = { left_hand: null, right_hand: null };

        // Flip X for avatar (mirror the user)
        const mapPoint = (pt) => ({
            x: (1 - pt[0]) * this.width,
            y: pt[1] * this.height,
            z: pt[2] * this.width // Z mapped to width for depth perception
        });

        if (landmarks.left_hand && landmarks.left_hand.length === 21) {
            scaled.left_hand = landmarks.left_hand.map(mapPoint);
        }
        if (landmarks.right_hand && landmarks.right_hand.length === 21) {
            scaled.right_hand = landmarks.right_hand.map(mapPoint);
        }

        return scaled;
    }

    initVelocities() {
        this.velocity = { left_hand: [], right_hand: [] };
        for (let i = 0; i < 21; i++) {
            this.velocity.left_hand.push({ x: 0, y: 0, z: 0 });
            this.velocity.right_hand.push({ x: 0, y: 0, z: 0 });
        }
    }

    animate() {
        let stillAnimating = false;

        // Clear and draw base
        this.drawSilhouette();

        // Update using spring physics
        ['left_hand', 'right_hand'].forEach(hand => {
            if (this.targetLandmarks[hand] && this.currentLandmarks[hand]) {
                for (let i = 0; i < 21; i++) {
                    const current = this.currentLandmarks[hand][i];
                    const target = this.targetLandmarks[hand][i];
                    const vel = this.velocity[hand][i];

                    // Spring force
                    const ax = (target.x - current.x) * this.stiffness;
                    const ay = (target.y - current.y) * this.stiffness;
                    const az = (target.z - current.z) * this.stiffness;

                    vel.x = (vel.x + ax) * this.damping;
                    vel.y = (vel.y + ay) * this.damping;
                    vel.z = (vel.z + az) * this.damping;

                    current.x += vel.x;
                    current.y += vel.y;
                    current.z += vel.z;

                    if (Math.abs(vel.x) > 0.1 || Math.abs(vel.y) > 0.1) {
                        stillAnimating = true;
                    }
                }

                // Draw the updated hand
                this.drawHand(this.currentLandmarks[hand], hand === 'left_hand' ? '#7C3AED' : '#00D4FF');
            }
        });

        if (stillAnimating) {
            requestAnimationFrame(() => this.animate());
        } else {
            this.animating = false;
        }
    }

    drawHand(points, color) {
        if (!points || points.length !== 21) return;

        // MediaPipe Hand connections
        const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
            [0, 5], [5, 6], [6, 7], [7, 8], // Index
            [5, 9], [9, 10], [10, 11], [11, 12], // Middle
            [9, 13], [13, 14], [14, 15], [15, 16], // Ring
            [13, 17], [0, 17], [17, 18], [18, 19], [19, 20] // Pinky
        ];

        // Glow effect
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = color;

        // Draw edges
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this.ctx.beginPath();
        connections.forEach(conn => {
            const p1 = points[conn[0]];
            const p2 = points[conn[1]];
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
        });
        this.ctx.stroke();

        // Draw joints
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.shadowBlur = 5;
        points.forEach((pt, index) => {
            // Make fingertips slightly larger
            const radius = [4, 8, 12, 16, 20].includes(index) ? 4 : 2;
            this.ctx.beginPath();
            this.ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
            this.ctx.fill();
        });

        this.ctx.shadowBlur = 0; // reset
    }

    clear() {
        this.currentLandmarks = null;
        this.targetLandmarks = null;
        this.animating = false;
        this.drawSilhouette();
    }
}

window.AvatarRenderer = AvatarRenderer;
