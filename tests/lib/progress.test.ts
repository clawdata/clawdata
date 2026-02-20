import { describe, it, expect } from 'vitest';
import { ProgressBar } from '../../src/lib/progress.js';
import { Writable } from 'node:stream';

/** Capture all writes to a buffer instead of stderr. */
function captureStream(): { stream: Writable; output: () => string } {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    },
  });
  return { stream, output: () => Buffer.concat(chunks).toString() };
}

describe('ProgressBar', () => {
  it('renders 0% initially after first tick of 0', () => {
    const { stream, output } = captureStream();
    const bar = new ProgressBar({ total: 10, stream, width: 10 });
    bar.update(0);
    expect(output()).toContain('0%');
  });

  it('tick() advances by 1 step', () => {
    const { stream, output } = captureStream();
    const bar = new ProgressBar({ total: 10, stream, width: 10 });
    bar.tick();
    expect(output()).toContain('10%');
    expect(output()).toContain('(1/10)');
  });

  it('tick(n) advances by n steps', () => {
    const { stream, output } = captureStream();
    const bar = new ProgressBar({ total: 20, stream, width: 10 });
    bar.tick(5);
    expect(output()).toContain('25%');
    expect(output()).toContain('(5/20)');
  });

  it('update() jumps to absolute value', () => {
    const { stream, output } = captureStream();
    const bar = new ProgressBar({ total: 10, stream, width: 10 });
    bar.update(7);
    expect(output()).toContain('70%');
  });

  it('finish() reaches 100%', () => {
    const { stream, output } = captureStream();
    const bar = new ProgressBar({ total: 5, stream, width: 10 });
    bar.tick(2);
    bar.finish();
    expect(output()).toContain('100%');
    expect(output()).toContain('(5/5)');
  });

  it('finish() appends a newline', () => {
    const { stream, output } = captureStream();
    const bar = new ProgressBar({ total: 1, stream, width: 5 });
    bar.finish();
    expect(output()).toMatch(/\n$/);
  });

  it('finish() is idempotent', () => {
    const { stream, output } = captureStream();
    const bar = new ProgressBar({ total: 3, stream, width: 5 });
    bar.finish();
    const len1 = output().length;
    bar.finish();
    const len2 = output().length;
    expect(len1).toBe(len2);
  });

  it('clamps at total even if tick overshoots', () => {
    const { stream, output } = captureStream();
    const bar = new ProgressBar({ total: 5, stream, width: 10 });
    bar.tick(999);
    expect(output()).toContain('100%');
    expect(output()).toContain('(5/5)');
  });

  it('includes label when provided', () => {
    const { stream, output } = captureStream();
    const bar = new ProgressBar({ total: 2, label: 'Ingesting', stream, width: 10 });
    bar.tick();
    expect(output()).toContain('Ingesting');
  });

  it('ratio returns correct fraction', () => {
    const { stream } = captureStream();
    const bar = new ProgressBar({ total: 4, stream, width: 5 });
    bar.tick(2);
    expect(bar.ratio).toBeCloseTo(0.5);
  });
});
