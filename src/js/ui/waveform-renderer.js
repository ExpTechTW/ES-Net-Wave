// Waveform Renderer Module
// Handles waveform visualization rendering
const constants = require('../constants');

class WaveformRenderer {
    constructor() {
        this.ctxX = null;
        this.ctxY = null;
        this.ctxZ = null;
        this.ctxTime = null;
        this.maxPoints = constants.WAVEFORM_CONSTANTS.CANVAS.MAX_POINTS;
        this.currentScale = constants.WAVEFORM_CONSTANTS.CANVAS.DEFAULT_SCALE;
        this.animationId = null;
        this.isInitialized = false;
    }

    // Initialize renderer with canvas contexts
    initialize(canvasX, canvasY, canvasZ, canvasTime) {
        if (canvasX && canvasY && canvasZ) {
            this.ctxX = canvasX.getContext('2d');
            this.ctxY = canvasY.getContext('2d');
            this.ctxZ = canvasZ.getContext('2d');
            this.ctxTime = canvasTime ? canvasTime.getContext('2d') : null;

            // Set canvas sizes
            this.setCanvasSizes(canvasX, canvasY, canvasZ, canvasTime);

            this.isInitialized = true;
        } else {
            console.error('Waveform canvases not found');
        }
    }

    // Set canvas sizes
    setCanvasSizes(canvasX, canvasY, canvasZ, canvasTime) {
        const chartArea = document.getElementById('chart-area');
        if (!chartArea) return;

        const width = chartArea.clientWidth;
        const height = chartArea.clientHeight;
        const perH = Math.max(40, Math.floor(height / 3));

        [canvasX, canvasY, canvasZ, canvasTime].forEach(canvas => {
            if (canvas) {
                canvas.width = width;
                canvas.height = perH;
            }
        });
    }

    // Handle window resize
    handleResize() {
        const canvasX = document.getElementById('waveform-x');
        const canvasY = document.getElementById('waveform-y');
        const canvasZ = document.getElementById('waveform-z');
        const canvasTime = document.getElementById('time-axis');
        this.setCanvasSizes(canvasX, canvasY, canvasZ, canvasTime);
    }

    // Update waveform data and render
    updateWaveformData(bufX, bufY, bufZ) {
        if (!this.isInitialized) return;

        this.drawWaveforms(bufX, bufY, bufZ);
    }

    // Start animation loop
    startAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        this.animate();
    }

    // Stop animation loop
    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    // Animation frame
    animate() {
        // Animation loop is handled by the main controller
        // This method can be used for future enhancements
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    // Draw all waveforms
    drawWaveforms(bufX, bufY, bufZ) {
        if (!this.ctxX || !this.ctxY || !this.ctxZ) return;

        const canvasX = document.getElementById('waveform-x');
        const canvasY = document.getElementById('waveform-y');
        const canvasZ = document.getElementById('waveform-z');

        if (!canvasX || !canvasY || !canvasZ) return;

        const width = canvasX.width;
        const height = canvasX.height;

        // Compute global scale from all axes
        let maxVal = 0;
        for (let i = 0; i < this.maxPoints; i++) {
            const localMax = Math.max(
                Math.abs(bufX[i] || 0),
                Math.abs(bufY[i] || 0),
                Math.abs(bufZ[i] || 0)
            );
            if (localMax > maxVal) maxVal = localMax;
        }
        this.currentScale = Math.max(maxVal, constants.WAVEFORM_CONSTANTS.CANVAS.DEFAULT_SCALE) * 1.1;

        const xStep = width / (this.maxPoints - 1);
        const yScale = (height / 2) / this.currentScale;

        // Draw each axis
        this.drawWaveformLine(this.ctxX, canvasX, bufX, constants.WAVEFORM_CONSTANTS.COLORS.WAVE_X, xStep, yScale, height);
        this.drawWaveformLine(this.ctxY, canvasY, bufY, constants.WAVEFORM_CONSTANTS.COLORS.WAVE_Y, xStep, yScale, height);
        this.drawWaveformLine(this.ctxZ, canvasZ, bufZ, constants.WAVEFORM_CONSTANTS.COLORS.WAVE_Z, xStep, yScale, height);

        // Draw time axis if available
        if (this.ctxTime) {
            const canvasTime = document.getElementById('time-axis');
            if (canvasTime) {
                this.drawTimeAxis(this.ctxTime, canvasTime);
            }
        }
    }

    // Draw a single waveform line
    drawWaveformLine(ctx, canvas, data, color, step, scale, h) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.drawGrid(ctx, canvas.width, canvas.height);

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;

        for (let i = 0; i < this.maxPoints; i++) {
            const x = i * step;
            const y = (h / 2) - ((data[i] || 0) * scale);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    // Draw grid lines
    drawGrid(ctx, w, h) {
        ctx.strokeStyle = constants.WAVEFORM_CONSTANTS.COLORS.GRID;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        for (let i = 1; i < constants.WAVEFORM_CONSTANTS.CANVAS.GRID_LINES; i++) {
            const x = (w / constants.WAVEFORM_CONSTANTS.CANVAS.GRID_LINES) * i;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        ctx.stroke();
    }

    // Draw time axis
    drawTimeAxis(ctx, canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Simple time axis - could be enhanced
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
    }

    // Cleanup
    destroy() {
        this.stopAnimation();

        // Clear canvas context references
        this.ctxX = null;
        this.ctxY = null;
        this.ctxZ = null;
        this.ctxTime = null;

        this.isInitialized = false;
    }
}

module.exports = WaveformRenderer;