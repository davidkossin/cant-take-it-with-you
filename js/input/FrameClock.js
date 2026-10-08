/** Fixed 60 Hz simulation, independent of display refresh rate. */
export class FrameClock {
  constructor({ hz = 60, maxSteps = 5 } = {}) {
    this.stepMs = 1000 / hz;
    this.maxSteps = maxSteps;
    this.reset();
  }

  reset() { this.last = null; this.accumulator = 0; }

  advance(now) {
    if (!Number.isFinite(now)) return { steps: 0, render: false };
    if (this.last == null) {
      this.last = now;
      return { steps: 0, render: true };
    }
    // A background tab or suspended device must not fast-forward the player.
    const elapsed = Math.max(0, Math.min(now - this.last, this.stepMs * this.maxSteps));
    this.last = now;
    this.accumulator += elapsed;
    const steps = Math.min(this.maxSteps, Math.floor((this.accumulator + 1e-7) / this.stepMs));
    this.accumulator = Math.max(0, this.accumulator - steps * this.stepMs);
    return { steps, render: steps > 0 };
  }
}
