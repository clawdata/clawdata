/**
 * Simple terminal progress bar — zero dependencies.
 *
 * Usage:
 *   const bar = new ProgressBar({ total: 10, label: 'Ingesting' });
 *   bar.tick();          // advance by 1
 *   bar.tick(3);         // advance by 3
 *   bar.update(7);       // jump to absolute position
 *   bar.finish();        // fill to 100 % and print newline
 */

export interface ProgressBarOptions {
  /** Total number of steps. */
  total: number;
  /** Label printed before the bar. */
  label?: string;
  /** Width of the bar in characters (default 30). */
  width?: number;
  /** The writable stream to render to (default process.stderr). */
  stream?: NodeJS.WritableStream;
}

export class ProgressBar {
  private total: number;
  private current = 0;
  private label: string;
  private width: number;
  private stream: NodeJS.WritableStream;
  private finished = false;

  constructor(options: ProgressBarOptions) {
    this.total = Math.max(options.total, 1);
    this.label = options.label ?? '';
    this.width = options.width ?? 30;
    this.stream = options.stream ?? process.stderr;
  }

  /** Advance the progress bar by `n` steps (default 1). */
  tick(n = 1): void {
    this.update(this.current + n);
  }

  /** Set the progress bar to an absolute position. */
  update(value: number): void {
    this.current = Math.min(Math.max(value, 0), this.total);
    this.render();
  }

  /** Complete the bar (fills to 100 %) and prints a trailing newline. */
  finish(): void {
    if (this.finished) return;
    this.current = this.total;
    this.render();
    this.stream.write('\n');
    this.finished = true;
  }

  /** Return the current fraction (0–1). */
  get ratio(): number {
    return this.current / this.total;
  }

  /** Render the bar to the stream. */
  private render(): void {
    const pct = Math.round(this.ratio * 100);
    const filled = Math.round(this.ratio * this.width);
    const empty = this.width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const prefix = this.label ? `${this.label} ` : '';
    const line = `\r${prefix}${bar} ${pct}% (${this.current}/${this.total})`;
    this.stream.write(line);
  }
}
