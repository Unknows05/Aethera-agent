// Sliding window rate limiter — max N requests per window
// Single global instance untuk semua Binance requests

export class RateLimiter {
  private timestamps: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests = 12, windowMs = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      const oldest = this.timestamps[0];
      const waitMs = this.windowMs - (now - oldest) + 50;
      await new Promise((r) => setTimeout(r, waitMs));
      return this.acquire();
    }

    this.timestamps.push(now);
  }
}

// Global singleton — semua public + signed requests lewat sini
export const globalLimiter = new RateLimiter(10, 1000);
