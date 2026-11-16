import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenAICompatProvider } from '../../providers/openai-compat.js';

class Probe extends OpenAICompatProvider {
  wst<T>(read: () => Promise<T>, ms: number, msg?: string): Promise<T> {
    return this.readWithStallTimeout(read, ms, msg);
  }
}

const probe = () => new Probe({ platform: 'groq', name: 'TestProvider', baseUrl: 'https://api.test.com/v1', timeoutMs: 1000 });

afterEach(() => { vi.useRealTimers(); });

describe('readWithStallTimeout', () => {
  it('rejects with the stall message after the configured silence', async () => {
    vi.useFakeTimers();
    const p = probe().wst(() => new Promise<never>(() => {}), 100).then(() => null, e => e);
    await vi.advanceTimersByTimeAsync(99);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2);
    const err = await p;
    expect(err.message).toBe('TestProvider stream stalled: no data for 100ms (timeout)');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses a custom message when given', async () => {
    vi.useFakeTimers();
    const p = probe().wst(() => new Promise<never>(() => {}), 50, 'custom').then(() => null, e => e);
    await vi.advanceTimersByTimeAsync(60);
    expect((await p).message).toBe('custom');
  });

  it('a slow-but-steady stream of many reads never trips (timeout is per read)', async () => {
    vi.useFakeTimers();
    const p = probe();
    for (let i = 0; i < 50; i++) {
      const r = p.wst(() => new Promise<number>(res => setTimeout(() => res(i), 80)), 100);
      await vi.advanceTimersByTimeAsync(80);
      expect(await r).toBe(i);
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it('leaves no timer pending after read resolve, reject, sync throw', async () => {
    vi.useFakeTimers();
    const p = probe();
    await p.wst(() => Promise.resolve(1), 100);
    expect(vi.getTimerCount()).toBe(0);
    await expect(p.wst(() => Promise.reject(new Error('boom')), 100)).rejects.toThrow('boom');
    expect(vi.getTimerCount()).toBe(0);
    await expect(p.wst(() => { throw new Error('sync'); }, 100)).rejects.toThrow('sync');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('timeout <= 0 disables the watchdog (no timer)', async () => {
    vi.useFakeTimers();
    const r = probe().wst(() => new Promise<number>(res => setTimeout(() => res(7), 10_000)), 0);
    expect(vi.getTimerCount()).toBe(1); // only the read's own timer
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await r).toBe(7);
  });
});
