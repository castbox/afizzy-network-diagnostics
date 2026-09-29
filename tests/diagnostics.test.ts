import { describe, expect, it, vi } from 'vitest';
import { execute, executeImage, tasksFor } from '../src/engine';
import { catalog } from '../src/model';

const tasks = tasksFor(catalog.targets);

describe('fixed DoH catalog', () => {
  it('queries three production hostnames and one fixed image resource', () => {
    expect(catalog.targets.map(target => target.id)).toEqual(['afizzy-site', 'afizzy-api', 'thebetter-api', 'afizzy-resource-1801']);
    expect(tasks).toHaveLength(13);
    expect(tasks.filter(task => task.kind === 'doh').every(task => ['cloudflare-dns.com', 'dns.google'].includes(new URL(task.url).hostname))).toBe(true);
    for (const target of catalog.targets.filter(target => target.checks.includes('doh'))) {
      const queries = tasks.filter(task => task.target.id === target.id);
      expect(queries).toHaveLength(4);
      expect(queries.map(task => new URL(task.url).searchParams.get('name'))).toEqual(Array(4).fill(new URL(target.url).hostname));
      expect(queries.map(task => task.dnsType)).toEqual(['A', 'AAAA', 'A', 'AAAA']);
    }
    const image = tasks.find(task => task.kind === 'image')!;
    expect(image.url).toBe('https://d2p265uuh9lhx2.cloudfront.net/character/assets/1801_image_m_mature_260819.jpg');
    expect(image.target.referenceBytes).toBe(62515);
  });
});

describe('image resource evidence', () => {
  const task = tasks.find(item => item.kind === 'image')!;
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 576;
    naturalHeight = 1024;
    referrerPolicy = '';
    set src(value: string) { if (value) queueMicrotask(() => this.onload?.()); }
    removeAttribute() {}
  }

  it('records load time without inventing transfer bytes or Mbps', async () => {
    const result = await executeImage(task, new AbortController().signal, () => new FakeImage() as unknown as HTMLImageElement);
    expect(result).toMatchObject({ source: 'browser', status: 'observed', code: 'resource-loaded', metrics: { referenceBytes: 62515, byteVisibility: 'unavailable', imageWidth: 576, imageHeight: 1024 } });
    expect(result.metrics.throughputMbps).toBeUndefined();
    expect(result.trace.map(entry => entry.phase)).toEqual(expect.arrayContaining(['start', 'load', 'timing', 'finish']));
  });

  it('keeps cancellation distinct from a failed image load', async () => {
    const controller = new AbortController(); controller.abort();
    const result = await executeImage(task, controller.signal, () => new FakeImage() as unknown as HTMLImageElement);
    expect(result).toMatchObject({ status: 'cancelled', code: 'cancelled' });
  });
});

describe('browser DoH evidence', () => {
  it('retains A, CNAME and TTL from a readable resolver response', async () => {
    const body = { Status: 0, Answer: [{ type: 5, data: 'alias.afizzy.com', TTL: 40 }, { type: 1, data: '203.0.113.1', TTL: 30 }] };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/dns-json' } }));
    const result = await execute(tasks[0], new AbortController().signal, fetcher as typeof fetch);
    expect(result).toMatchObject({ source: 'browser', code: 'dns-answer', metrics: { answer0: 'CNAME alias.afizzy.com', ttl1: 30 } });
    expect(result.trace.map(entry => entry.phase)).toEqual(expect.arrayContaining(['start', 'response', 'answer', 'finish']));
    expect(fetcher.mock.calls).toHaveLength(1);
  });
  it('does not mistake resolver errors or browser failures for target outages', async () => {
    const dnsError = await execute(tasks[0], new AbortController().signal, vi.fn(async () => new Response(JSON.stringify({ Status: 3, Answer: [] }), { status: 200 })) as typeof fetch);
    const httpError = await execute(tasks[0], new AbortController().signal, vi.fn(async () => new Response(null, { status: 503 })) as typeof fetch);
    const rejected = await execute(tasks[0], new AbortController().signal, vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch);
    expect(dnsError).toMatchObject({ status: 'failed', code: 'dns-error', metrics: { rcode: 3 } });
    expect(httpError).toMatchObject({ status: 'unknown', code: 'doh-http-error' });
    expect(rejected).toMatchObject({ status: 'unknown', code: 'browser-network-error' });
  });
  it('keeps timeout separate from user cancellation', async () => {
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('stopped', 'AbortError')), { once: true });
    })) as typeof fetch;
    const timed = await execute(tasks[0], new AbortController().signal, fetcher, 5);
    const controller = new AbortController(); controller.abort();
    const cancelled = await execute(tasks[0], controller.signal, fetcher);
    expect(timed).toMatchObject({ status: 'unknown', code: 'timeout' });
    expect(cancelled).toMatchObject({ status: 'cancelled', code: 'cancelled' });
  });
});
