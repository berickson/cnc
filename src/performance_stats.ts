// TypeScript equivalent of RunStatistics for performance monitoring
export class RunStatistics {
  public name: string;
  private start_time: number = 0;
  private sum_elapsed_ms: number = 0;
  private last_elapsed_ms: number = 0;
  private max_elapsed_ms: number = 0;
  private sum_elapsed_msSquared: number = 0;
  private count: number = 0;

  constructor(name: string) {
    this.name = name;
  }

  start(): void {
    this.start_time = performance.now();
  }

  stop(): void {
    this.last_elapsed_ms = performance.now() - this.start_time;
    this.sum_elapsed_ms += this.last_elapsed_ms;
    this.sum_elapsed_msSquared += this.last_elapsed_ms * this.last_elapsed_ms;
    if (this.last_elapsed_ms > this.max_elapsed_ms) {
      this.max_elapsed_ms = this.last_elapsed_ms;
    }
    this.count++;
  }

  mean(): number {
    return this.count > 0 ? this.sum_elapsed_ms / this.count : 0;
  }

  stddev(): number {
    if (this.count <= 1) return 0;
    const mean_val = this.mean();
    const variance = (this.sum_elapsed_msSquared / this.count) - (mean_val * mean_val);
    return Math.sqrt(Math.max(0, variance));
  }

  max(): number {
    return this.max_elapsed_ms;
  }

  last(): number {
    return this.last_elapsed_ms;
  }

  total(): number {
    return this.sum_elapsed_ms;
  }

  get_count(): number {
    return this.count;
  }

  reset(): void {
    this.start_time = 0;
    this.sum_elapsed_ms = 0;
    this.last_elapsed_ms = 0;
    this.max_elapsed_ms = 0;
    this.sum_elapsed_msSquared = 0;
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
export async function time_async<T>(stats: RunStatistics, fn: () => Promise<T>): Promise<T> {
  stats.start();
  try {
    return await fn();
  } finally {
    stats.stop();
  }
}

// Helper function for timing sync operations
export function time_sync<T>(stats: RunStatistics, fn: () => T): T {
  stats.start();
  try {
    return fn();
  } finally {
    stats.stop();
  }
}
