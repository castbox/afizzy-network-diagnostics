import data from './catalog.generated.json';

export type Language = 'zh' | 'en';
export type Status = 'observed' | 'failed' | 'unknown' | 'cancelled';
export type Source = 'browser';
export type Metric = string | number | boolean | null;

export interface TraceEntry {
  at: string;
  elapsedMs: number;
  phase: string;
  detail: string;
}

export interface Result {
  id: string;
  target: string;
  targetId: string;
  protocol: string;
  source: Source;
  startedAt: string | null;
  durationMs: number | null;
  status: Status;
  code: string;
  metrics: Record<string, Metric>;
  headers: Record<string, string>;
  trace: TraceEntry[];
}

export interface Report {
  schemaVersion: 2;
  id: string;
  catalogVersion: string;
  startedAt: string;
  finishedAt: string | null;
  environment: string;
  group: string;
  device: { browser: string; online: boolean };
  results: Result[];
  events: { at: string; type: string }[];
}

export interface Target {
  id: string;
  label: string;
  environment: string;
  group: string;
  url: string;
  method: 'GET';
  enabled: boolean;
  checks: ('doh' | 'image')[];
  referenceBytes?: number;
}

interface Catalog {
  version: string;
  limits: { concurrency: number; dohTimeoutMs: number; resourceTimeoutMs: number; runTimeoutMs: number };
  targets: Target[];
  resolvers: { id: string; url: string }[];
}

export const catalog = data as unknown as Catalog;
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();

export function newReport(environment: string, group: string): Report {
  return {
    schemaVersion: 2,
    id: uid(),
    catalogVersion: catalog.version,
    startedAt: now(),
    finishedAt: null,
    environment,
    group,
    device: { browser: navigator.userAgent, online: navigator.onLine },
    results: [],
    events: [],
  };
}
