import { catalog, newReport, now, uid, type Report, type Result, type Target, type TraceEntry } from './model';

export interface Task {
  target: Target;
  kind: 'doh' | 'image';
  protocol: string;
  url: string;
  dnsType?: 'A' | 'AAAA';
}

export function tasksFor(targets: Target[]): Task[] {
  return targets.flatMap(target => {
    const tasks: Task[] = [];
    if (target.checks.includes('doh')) for (const resolver of catalog.resolvers) for (const dnsType of ['A', 'AAAA'] as const) {
      const url = new URL(resolver.url);
      url.searchParams.set('name', new URL(target.url).hostname);
      url.searchParams.set('type', dnsType);
      tasks.push({ target, kind: 'doh', protocol: `DoH/${resolver.id}/${dnsType}`, url: url.href, dnsType });
    }
    if (target.checks.includes('image')) tasks.push({ target, kind: 'image', protocol: 'Resource/image', url: target.url });
    return tasks;
  });
}

async function boundedText(response: Response, limit = 65536): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('response-too-large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

function readableHeaders(response: Response): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of response.headers) {
    if (/authorization|cookie|authentication/i.test(key) || Object.keys(headers).length >= 60) continue;
    if (value.length <= 2000 && !/[\r\n\0]/.test(value)) headers[key] = value;
  }
  return headers;
}

export async function execute(task: Task, parent: AbortSignal, fetcher: typeof fetch = fetch, timeoutOverride?: number): Promise<Result> {
  if (task.kind !== 'doh') throw new Error('Expected a DoH task');
  const controller = new AbortController();
  const abort = () => controller.abort(parent.reason);
  parent.addEventListener('abort', abort, { once: true });
  if (parent.aborted) abort();
  const timeout = timeoutOverride ?? catalog.limits.dohTimeoutMs;
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeout);
  const started = performance.now();
  const trace: TraceEntry[] = [];
  const log = (phase: string, detail: string) => trace.push({ at: now(), elapsedMs: Math.round(performance.now() - started), phase, detail: detail.slice(0, 2000) });
  const result: Result = {
    id: uid(), target: task.target.url, targetId: task.target.id, protocol: task.protocol,
    source: 'browser', startedAt: now(), durationMs: null,
    status: 'unknown', code: 'unclassified', metrics: {}, headers: {}, trace,
  };
  log('start', `GET ${task.url}; mode=cors; timeout=${timeout}ms`);
  try {
    controller.signal.throwIfAborted();
    const response = await fetcher(task.url, {
      method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'manual',
      referrerPolicy: 'no-referrer', signal: controller.signal, headers: { Accept: 'application/dns-json' },
    });
    if (response.type === 'opaque' || response.type === 'opaqueredirect' || response.status === 0) {
      result.code = 'opaque-response';
      log('response', `unreadable ${response.type} response; HTTP status and headers unavailable`);
    } else {
      result.headers = readableHeaders(response);
      result.metrics.httpStatus = response.status;
      result.status = 'observed';
      result.code = response.ok ? 'doh-http-response' : 'doh-http-error';
      log('response', `HTTP ${response.status} ${response.statusText || ''}; type=${response.type}; exposedHeaders=${Object.keys(result.headers).length}`);
      for (const [key, value] of Object.entries(result.headers)) log('header', `${key}: ${value}`);
      if (response.ok) {
        const body = JSON.parse(await boundedText(response)) as { Status?: number; Answer?: { type: number; data: string; TTL?: number }[] };
        if (!Number.isInteger(body.Status) || body.Status! < 0 || body.Status! > 15) throw new Error('invalid-dns-response');
        result.metrics.rcode = body.Status!;
        let count = 0;
        for (const answer of Array.isArray(body.Answer) ? body.Answer.slice(0, 32) : []) {
          if (![1, 5, 28].includes(answer.type) || typeof answer.data !== 'string' || !/^[a-zA-Z0-9:._-]{1,253}$/.test(answer.data)) continue;
          const label = { 1: 'A', 5: 'CNAME', 28: 'AAAA' }[answer.type as 1 | 5 | 28];
          result.metrics[`answer${count}`] = `${label} ${answer.data}`;
          if (Number.isFinite(answer.TTL) && answer.TTL! >= 0) result.metrics[`ttl${count}`] = answer.TTL!;
          log('answer', `${label} ${answer.data}${Number.isFinite(answer.TTL) ? `; TTL=${answer.TTL}` : ''}`);
          count++;
        }
        result.metrics.answerCount = count;
        result.code = body.Status === 0 ? count ? 'dns-answer' : 'dns-empty' : 'dns-error';
        result.status = body.Status === 0 ? 'observed' : body.Status === 3 ? 'failed' : 'unknown';
      } else { result.status = 'unknown'; await response.body?.cancel(); }
    }
  } catch (error) {
    if (controller.signal.aborted) {
      const timedOut = controller.signal.reason?.name === 'TimeoutError';
      result.status = timedOut ? 'unknown' : 'cancelled';
      result.code = timedOut ? 'timeout' : 'cancelled';
      log('abort', timedOut ? `timeout after ${timeout}ms` : 'cancelled by user or run budget');
    } else {
      const name = error instanceof Error ? error.name : 'Error';
      const message = error instanceof Error ? error.message : 'unknown error';
      result.status = 'unknown';
      result.code = error instanceof SyntaxError || ['invalid-dns-response', 'response-too-large'].includes(message) ? 'invalid-response' : 'browser-network-error';
      log('error', `${name}: ${message}`);
    }
  } finally {
    clearTimeout(timer);
    parent.removeEventListener('abort', abort);
    result.durationMs = Math.round(performance.now() - started);
    log('finish', `${result.status}; ${result.durationMs}ms`);
  }
  return result;
}

export async function executeImage(task: Task, parent: AbortSignal, createImage: () => HTMLImageElement = () => new Image(), timeoutOverride?: number): Promise<Result> {
  if (task.kind !== 'image') throw new Error('Expected an image task');
  const controller = new AbortController();
  const abort = () => controller.abort(parent.reason);
  parent.addEventListener('abort', abort, { once: true });
  if (parent.aborted) abort();
  const timeout = timeoutOverride ?? catalog.limits.resourceTimeoutMs;
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeout);
  const sampleUrl = new URL(task.url);
  sampleUrl.searchParams.set('diagnostic', uid());
  const started = performance.now();
  const trace: TraceEntry[] = [];
  const log = (phase: string, detail: string) => trace.push({ at: now(), elapsedMs: Math.round(performance.now() - started), phase, detail });
  const result: Result = {
    id: uid(), target: task.target.url, targetId: task.target.id, protocol: task.protocol, source: 'browser',
    startedAt: now(), durationMs: null, status: 'unknown', code: 'unclassified',
    metrics: { referenceBytes: task.target.referenceBytes ?? null, byteVisibility: 'unavailable' }, headers: {}, trace,
  };
  const image = createImage();
  image.referrerPolicy = 'no-referrer';
  let onAbort: (() => void) | undefined;
  log('start', `GET ${sampleUrl.href}; image load; timeout=${timeout}ms`);
  try {
    await new Promise<void>((resolve, reject) => {
      onAbort = () => { image.onload = null; image.onerror = null; image.removeAttribute('src'); reject(controller.signal.reason); };
      controller.signal.addEventListener('abort', onAbort, { once: true });
      if (controller.signal.aborted) { onAbort(); return; }
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('image-load-error'));
      image.src = sampleUrl.href;
    });
    result.status = 'observed';
    result.code = 'resource-loaded';
    result.metrics.imageWidth = image.naturalWidth;
    result.metrics.imageHeight = image.naturalHeight;
    log('load', `image loaded; ${image.naturalWidth}x${image.naturalHeight}`);
    const entry = (performance.getEntriesByName(sampleUrl.href, 'resource') as PerformanceResourceTiming[]).filter(item => item.startTime >= started).at(-1);
    if (entry && entry.transferSize > 0 && entry.encodedBodySize > 0) {
      result.metrics.byteVisibility = 'exposed';
      result.metrics.encodedBodyBytes = entry.encodedBodySize;
      const receiveMs = entry.responseEnd - entry.responseStart;
      if (entry.encodedBodySize >= 512 * 1024 && receiveMs > 0) result.metrics.throughputMbps = Math.round(entry.encodedBodySize * 8 / receiveMs / 1000 * 100) / 100;
      log('timing', `encodedBodyBytes=${entry.encodedBodySize}; receiveMs=${Math.round(receiveMs)}`);
    } else log('timing', 'Cross-origin transfer bytes are unavailable; no Mbps is calculated.');
  } catch (error) {
    if (controller.signal.aborted) {
      const timedOut = controller.signal.reason?.name === 'TimeoutError';
      result.status = timedOut ? 'unknown' : 'cancelled';
      result.code = timedOut ? 'timeout' : 'cancelled';
      log('abort', timedOut ? `timeout after ${timeout}ms` : 'cancelled by user or run budget');
    } else {
      result.status = 'unknown';
      result.code = 'resource-load-error';
      log('error', error instanceof Error ? error.message : 'image load failed');
    }
  } finally {
    clearTimeout(timer);
    parent.removeEventListener('abort', abort);
    if (onAbort) controller.signal.removeEventListener('abort', onAbort);
    image.onload = null;
    image.onerror = null;
    result.durationMs = Math.round(performance.now() - started);
    log('finish', `${result.status}; ${result.durationMs}ms`);
  }
  return result;
}

export async function runBrowser(options: { targets: Target[]; environment: string; group: string; signal: AbortSignal; onUpdate: (report: Report) => void; fetcher?: typeof fetch; imageFactory?: () => HTMLImageElement; timeoutMs?: number }): Promise<Report> {
  const report = newReport(options.environment, options.group);
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal.reason);
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) abort();
  const timer = setTimeout(() => controller.abort(new DOMException('run-budget', 'TimeoutError')), options.timeoutMs ?? catalog.limits.runTimeoutMs);
  const publish = () => options.onUpdate({ ...report, results: [...report.results], events: [...report.events] });
  const visibility = () => { report.events.push({ at: now(), type: document.visibilityState === 'hidden' ? 'page-hidden' : 'page-visible' }); publish(); };
  const online = () => { report.events.push({ at: now(), type: navigator.onLine ? 'online' : 'offline' }); publish(); };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('online', online);
  window.addEventListener('offline', online);
  const tasks = tasksFor(options.targets);
  let cursor = 0;
  publish();
  try {
    await Promise.all(Array.from({ length: Math.min(catalog.limits.concurrency, tasks.length) }, async () => {
      while (cursor < tasks.length && !controller.signal.aborted) {
        const task = tasks[cursor++];
        report.results.push(task.kind === 'image' ? await executeImage(task, controller.signal, options.imageFactory) : await execute(task, controller.signal, options.fetcher));
        publish();
      }
    }));
    for (const task of tasks.slice(cursor)) report.results.push({
      id: uid(), target: task.target.url, targetId: task.target.id, protocol: task.protocol,
      source: 'browser', startedAt: null, durationMs: null,
      status: 'cancelled', code: 'not-run', metrics: {}, headers: {}, trace: [],
    });
    report.events.push({ at: now(), type: controller.signal.aborted ? controller.signal.reason?.name === 'TimeoutError' ? 'run-timeout' : 'run-cancelled' : 'run-complete' });
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener('abort', abort);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('online', online);
    window.removeEventListener('offline', online);
    report.finishedAt = now();
    publish();
  }
  return report;
}
