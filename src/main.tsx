import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import './style.css';
import { catalog, type Language, type Report, type Result, type Target } from './model';
import { runBrowser, tasksFor } from './engine';
import { describe, protocolLabel, strings, targetLabel } from './i18n';

function ResultRow({ result, lang }: { result: Result; lang: Language }) {
  const t = strings[lang];
  return <details className="result">
    <summary>
      <span className="result-name"><span className={`dot ${result.status}`} /><strong>{protocolLabel(result.protocol, lang)}</strong><small>{t.browser}</small></span>
      <span className="result-outcome"><span>{t[result.status]}</span><code>{result.durationMs === null ? '—' : `${result.durationMs} ms`}</code></span>
    </summary>
    <div className="result-detail">
      <p>{describe(result, lang)}</p>
      {Object.keys(result.metrics).length > 0 && <section><h4>{t.metrics}</h4><dl>{Object.entries(result.metrics).map(([key, value]) => <React.Fragment key={key}><dt>{key}</dt><dd>{String(value)}</dd></React.Fragment>)}</dl></section>}
      {Object.keys(result.headers).length > 0 && <section><h4>{t.headers}</h4><dl>{Object.entries(result.headers).map(([key, value]) => <React.Fragment key={key}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}</dl></section>}
      <section><h4>{t.log}</h4>{result.trace.length ? <ol className="trace">{result.trace.map((entry, i) => <li key={i}><time>{entry.elapsedMs} ms</time><b>{entry.phase}</b><span>{entry.detail}</span></li>)}</ol> : <p>{t.none}</p>}</section>
    </div>
  </details>;
}

function App() {
  const [lang, setLang] = useState<Language>(navigator.language.startsWith('zh') ? 'zh' : 'en');
  const [report, setReport] = useState<Report | null>(null);
  const [running, setRunning] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const t = strings[lang];
  const targets = catalog.targets.filter(target => target.enabled) as Target[];
  const total = tasksFor(targets).length;

  useEffect(() => { document.documentElement.lang = lang; document.title = t.title; }, [lang, t.title]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (report && !downloaded) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [report, downloaded]);
  useEffect(() => () => abort.current?.abort(), []);

  const start = async () => {
    if (running || !targets.length) return;
    setReport(null); setDownloaded(false); setRunning(true);
    const controller = new AbortController(); abort.current = controller;
    try { await runBrowser({ targets, environment: 'production', group: 'all', signal: controller.signal, onUpdate: setReport }); }
    finally { abort.current = null; setRunning(false); }
  };
  useEffect(() => { void start(); }, []);

  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `afizzy-network-${report.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setDownloaded(true);
  };

  const taskOrder = new Map(tasksFor(targets).map((task, index) => [`${task.target.id}:${task.protocol}`, index]));
  const groups = targets.map(target => ({ target, results: report?.results.filter(result => result.targetId === target.id).sort((a, b) => (taskOrder.get(`${a.targetId}:${a.protocol}`) ?? 999) - (taskOrder.get(`${b.targetId}:${b.protocol}`) ?? 999)) ?? [] }));
  const counts = report ? (['observed', 'failed', 'unknown', 'cancelled'] as const).map(status => ({ status, count: report.results.filter(result => result.status === status).length })).filter(item => item.count > 0) : [];

  return <>
    <a className="skip" href="#main">{lang === 'zh' ? '跳转到检测' : 'Skip to check'}</a>
    <header className="header"><div className="header-inner"><div className="brand"><span className="brand-mark">A</span><span>afizzy</span><span className="brand-divider">/</span><span className="brand-label">{lang === 'zh' ? '网络诊断' : 'Network diagnostics'}</span></div><button className="lang" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} lang={lang === 'zh' ? 'en' : 'zh'}>{lang === 'zh' ? 'English' : '中文'}</button></div></header>
    <main id="main" tabIndex={-1}>
      <h1>{t.title}</h1>
      <p className="subtitle">{t.subtitle}</p>
      <section className="controls" aria-label={t.title}>
        <div className="actions"><button className="primary" onClick={() => void start()} disabled={running || !targets.length}>{report ? t.rerun : t.start}</button>{running && <button onClick={() => abort.current?.abort(new DOMException('user', 'AbortError'))}>{t.stop}</button>}{report && !running && <button onClick={download}>{t.download}</button>}</div>
        <div className="run-state" aria-live="polite"><span className={`dot ${running ? 'active' : report ? 'observed' : 'idle'}`} /><strong>{running ? t.running : report ? t.finished : t.ready}</strong>{running && <span>{report?.results.length ?? 0} / {total}</span>}</div>
        {running && <progress value={report?.results.length ?? 0} max={total} aria-label={t.running} />}
      </section>
      <p className="scope-note">{t.boundary} {t.limit}</p>
      <section className="report" aria-label={t.results}>
        <div className="report-heading"><h2>{t.results}</h2>{report && <time>{new Date(report.startedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</time>}</div>
        <div className="counts">{counts.map(item => <span key={item.status}><span className={`dot ${item.status}`}/>{t[item.status]} <b>{item.count}</b></span>)}</div>
        {groups.map(({ target, results }) => <section className="target-group" key={target.id}><div className="target-heading"><h3>{targetLabel(target.id, lang)}</h3><code>{new URL(target.url).hostname}</code></div>{results.length ? results.map(result => <ResultRow key={result.id} result={result} lang={lang} />) : <p className="pending">{running ? t.running : t.ready}</p>}</section>)}
        <p className="privacy">{t.privacy}</p>
      </section>
    </main>
    <footer><span>Afizzy</span><span>{lang === 'zh' ? '目录版本' : 'Catalog'} {catalog.version}</span></footer>
  </>;
}

createRoot(document.getElementById('root')!).render(<App />);
