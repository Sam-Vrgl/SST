export class RateLimiter {
  private tail = Promise.resolve();
  private lastSlotTime = 0;

  constructor(private readonly minGapMs = 500) {}

  wait(): Promise<void> {
    const result = this.tail.then(() => {
      const now = Date.now();
      const delay = Math.max(0, this.minGapMs - (now - this.lastSlotTime));
      this.lastSlotTime = now + delay;
      return delay > 0 ? new Promise<void>(r => setTimeout(r, delay)) : undefined;
    });
    this.tail = result;
    return result;
  }
}
