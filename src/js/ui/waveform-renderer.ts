// Waveform Renderer Module
// Handles waveform visualization rendering
import { ES } from "../constants";

class WaveformRenderer {
  private ctxX: CanvasRenderingContext2D | null = null;
  private ctxY: CanvasRenderingContext2D | null = null;
  private ctxZ: CanvasRenderingContext2D | null = null;
  private ctxTime: CanvasRenderingContext2D | null = null;
  private maxPoints: number = ES.CANVAS.MAX_POINTS;
  private animationId: number | null = null;
  private isInitialized: boolean = false;

  constructor() {
    // Constructor is empty as properties are initialized above
  }

  // Initialize renderer with canvas contexts
  initialize(
    canvasX: HTMLElement | null,
    canvasY: HTMLElement | null,
    canvasZ: HTMLElement | null,
    canvasTime: HTMLElement | null,
  ) {
    if (canvasX && canvasY && canvasZ) {
      this.ctxX = (canvasX as HTMLCanvasElement).getContext("2d");
      this.ctxY = (canvasY as HTMLCanvasElement).getContext("2d");
      this.ctxZ = (canvasZ as HTMLCanvasElement).getContext("2d");
      this.ctxTime = canvasTime
        ? (canvasTime as HTMLCanvasElement).getContext("2d")
        : null;

      // Set canvas sizes
      this.setCanvasSizes(
        canvasX as HTMLCanvasElement,
        canvasY as HTMLCanvasElement,
        canvasZ as HTMLCanvasElement,
        canvasTime as HTMLCanvasElement,
      );

      this.isInitialized = true;
    } else {
      console.error("Waveform canvases not found");
    }
  }

  // Set canvas sizes
  setCanvasSizes(
    canvasX: HTMLElement | null,
    canvasY: HTMLElement | null,
    canvasZ: HTMLElement | null,
    canvasTime: HTMLElement | null,
  ) {
    const chartArea = document.getElementById("chart-area");
    if (!chartArea) return;

    const width = chartArea.clientWidth;
    const height = chartArea.clientHeight;
    const perH = Math.max(40, Math.floor(height / 3));

    [canvasX, canvasY, canvasZ, canvasTime].forEach((canvas) => {
      if (canvas) {
        (canvas as HTMLCanvasElement).width = width;
        (canvas as HTMLCanvasElement).height = perH;
      }
    });
  }

  // Handle window resize
  handleResize() {
    const canvasX = document.getElementById("waveform-x");
    const canvasY = document.getElementById("waveform-y");
    const canvasZ = document.getElementById("waveform-z");
    const canvasTime = document.getElementById("time-axis");
    this.setCanvasSizes(canvasX, canvasY, canvasZ, canvasTime);
  }

  // Update waveform data and render
  updateWaveformData(bufX: number[], bufY: number[], bufZ: number[]) {
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
  drawWaveforms(bufX: number[], bufY: number[], bufZ: number[]) {
    if (!this.ctxX || !this.ctxY || !this.ctxZ) return;

    const canvasX = document.getElementById("waveform-x") as HTMLCanvasElement;
    const canvasY = document.getElementById("waveform-y") as HTMLCanvasElement;
    const canvasZ = document.getElementById("waveform-z") as HTMLCanvasElement;

    if (!canvasX || !canvasY || !canvasZ) return;

    const width = (canvasX as HTMLCanvasElement).width;
    const height = (canvasX as HTMLCanvasElement).height;

    // Compute individual scales for each axis
    const scaleX = this.computeAxisScale(bufX);
    const scaleY = this.computeAxisScale(bufY);
    const scaleZ = this.computeAxisScale(bufZ);

    const xStep = width / (this.maxPoints - 1);

    // Draw each axis with its individual scale
    this.drawWaveformLine(
      this.ctxX,
      canvasX,
      bufX,
      ES.COLORS.WAVE_X,
      xStep,
      height / 2 / scaleX,
      height,
    );
    this.drawWaveformLine(
      this.ctxY,
      canvasY,
      bufY,
      ES.COLORS.WAVE_Y,
      xStep,
      height / 2 / scaleY,
      height,
    );
    this.drawWaveformLine(
      this.ctxZ,
      canvasZ,
      bufZ,
      ES.COLORS.WAVE_Z,
      xStep,
      height / 2 / scaleZ,
      height,
    );

    // Draw time axis if available
    if (this.ctxTime) {
      const canvasTime = document.getElementById(
        "time-axis",
      ) as HTMLCanvasElement;
      if (canvasTime) {
        this.drawTimeAxis(this.ctxTime, canvasTime);
      }
    }
  }

  // Compute scale for a single axis
  computeAxisScale(data: number[]): number {
    let maxVal = 0;
    for (let i = 0; i < this.maxPoints; i++) {
      const val = data[i];
      if (!Number.isNaN(val)) {
        const absVal = Math.abs(val);
        if (absVal > maxVal) maxVal = absVal;
      }
    }
    return Math.max(maxVal, ES.CANVAS.DEFAULT_SCALE) * 1.1;
  }

  // Draw a single waveform line
  drawWaveformLine(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLElement,
    data: number[],
    color: string,
    step: number,
    scale: number,
    h: number,
  ) {
    const canvasEl = canvas as HTMLCanvasElement;
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    this.drawGrid(ctx, canvasEl.width, canvasEl.height);

    // Check if all data is NaN (no data to display)
    const hasValidData = data.some((val) => !Number.isNaN(val));
    if (!hasValidData) return;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    for (let i = 0; i < this.maxPoints; i++) {
      const val = data[i];
      if (Number.isNaN(val)) continue;

      const x = i * step;
      const y = h / 2 - val * scale;
      if (i === 0 || Number.isNaN(data[i - 1])) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Draw grid lines
  drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.strokeStyle = ES.COLORS.GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();

    // Draw 12 vertical grid lines (including borders)
    for (let i = 0; i <= 12; i++) {
      const x = (w / 12) * i;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }

    ctx.stroke();
  }

  // Draw time axis
  drawTimeAxis(ctx: CanvasRenderingContext2D, canvas: HTMLElement) {
    ctx.clearRect(
      0,
      0,
      (canvas as HTMLCanvasElement).width,
      (canvas as HTMLCanvasElement).height,
    );
    // Simple time axis - could be enhanced
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, (canvas as HTMLCanvasElement).height / 2);
    ctx.lineTo(
      (canvas as HTMLCanvasElement).width,
      (canvas as HTMLCanvasElement).height / 2,
    );
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

export default WaveformRenderer;
