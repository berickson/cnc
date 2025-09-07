// TypeScript equivalent of RunStatistics for performance monitoring
export class RunStatistics {
  public name: string;
  private startTime: number = 0;
  private sumElapsedMs: number = 0;
  private lastElapsedMs: number = 0;
  private maxElapsedMs: number = 0;
  private sumElapsedMsSquared: number = 0;
  private count: number = 0;

  constructor(name: string) {
    this.name = name;
  }

  start(): void {
    this.startTime = performance.now();
  }

  stop(): void {
    this.lastElapsedMs = performance.now() - this.startTime;
    this.sumElapsedMs += this.lastElapsedMs;
    this.sumElapsedMsSquared += this.lastElapsedMs * this.lastElapsedMs;
    if (this.lastElapsedMs > this.maxElapsedMs) {
      this.maxElapsedMs = this.lastElapsedMs;
    }
    this.count++;
  }

  mean(): number {
    return this.count > 0 ? this.sumElapsedMs / this.count : 0;
  }

  stddev(): number {
    if (this.count <= 1) return 0;
    const meanVal = this.mean();
    const variance = (this.sumElapsedMsSquared / this.count) - (meanVal * meanVal);
    return Math.sqrt(Math.max(0, variance));
  }

  max(): number {
    return this.maxElapsedMs;
  }

  last(): number {
    return this.lastElapsedMs;
  }

  total(): number {
    return this.sumElapsedMs;
  }

  getCount(): number {
    return this.count;
  }

  reset(): void {
    this.startTime = 0;
    this.sumElapsedMs = 0;
    this.lastElapsedMs = 0;
    this.maxElapsedMs = 0;
    this.sumElapsedMsSquared = 0;
    this.count = 0;
  }

  toString(): string {
    return `${this.name}: count=${this.count} mean=${this.mean().toFixed(3)}ms stddev=${this.stddev().toFixed(3)}ms max=${this.max().toFixed(3)}ms total=${this.total().toFixed(3)}ms last=${this.last().toFixed(3)}ms`;
  }

  // Log stats if they're significant (> 10ms mean or > 50ms max)
  logIfSlow(): void {
    if (this.count > 0 && (this.mean() > 10 || this.max() > 50)) {
      console.warn(`🐌 Slow operation detected: ${this.toString()}`);
    }
  }
}

// RAII-style timer using try/finally
export class BlockTimer {
  constructor(private stats: RunStatistics) {
    this.stats.start();
  }

  stop(): void {
    this.stats.stop();
  }
}

// Helper function for timing async operations
export async function timeAsync<T>(stats: RunStatistics, fn: () => Promise<T>): Promise<T> {
  stats.start();
  try {
    return await fn();
  } finally {
    stats.stop();
  }
}

// Helper function for timing sync operations
export function timeSync<T>(stats: RunStatistics, fn: () => T): T {
  stats.start();
  try {
    return fn();
  } finally {
    stats.stop();
  }
}
