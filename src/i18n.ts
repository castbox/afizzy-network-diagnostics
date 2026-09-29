import type { Language, Result } from './model';

export const strings = {
  zh: {
    title: 'Afizzy 网络检测', subtitle: '一次查看三个域名的 DoH 解析与 Afizzy 图片资源加载。',
    start: '开始检测', rerun: '重新检测', stop: '停止', download: '下载完整日志 JSON',
    ready: '尚未检测', running: '检测中', finished: '检测完成',
    browser: '当前浏览器', source: '采集位置', status: '状态', duration: '耗时',
    observed: '收到结果', failed: '查询错误', unknown: '无法判定', cancelled: '未完成',
    results: '检测结果', details: '详情与日志', headers: '可读取的响应头', metrics: '可读取的指标', log: '事件日志',
    none: '无', limit: 'DoH 最长等待 10 秒，图片最长等待 15 秒；跨域限制可能使传输字节数不可见。',
    boundary: '全部请求由当前浏览器发起。DoH 不代表本机系统 DNS；图片较小，加载耗时不等于网络带宽。',
    privacy: '报告只留在当前页面，下载后保存在本机；不采集请求正文或凭据。',
    incomplete: '浏览器未提供更多信息，具体失败阶段未知。',
    finishedNotice: '已保留本次所有可观察日志。',
  },
  en: {
    title: 'Afizzy network check', subtitle: 'Check three DoH targets and one Afizzy image resource in one run.',
    start: 'Start check', rerun: 'Run again', stop: 'Stop', download: 'Download full JSON log',
    ready: 'Not checked', running: 'Checking', finished: 'Check finished',
    browser: 'This browser', source: 'Measured from', status: 'Status', duration: 'Duration',
    observed: 'Result received', failed: 'Query error', unknown: 'Inconclusive', cancelled: 'Incomplete',
    results: 'Results', details: 'Details and log', headers: 'Readable response headers', metrics: 'Readable metrics', log: 'Event log',
    none: 'None', limit: 'DoH waits up to 10 seconds; the image waits up to 15 seconds. Cross-origin rules may hide transfer bytes.',
    boundary: 'Every request runs from this browser. DoH is not system DNS; this small image\'s load time is not a bandwidth measurement.',
    privacy: 'The report stays on this page or in a local download. Request bodies and credentials are not collected.',
    incomplete: 'The browser exposed no further detail, so the failing stage is unknown.',
    finishedNotice: 'All available logs from this run were kept.',
  },
};

const codes: Record<string, [string, string]> = {
  'doh-http-error': ['DoH 服务返回 HTTP 错误，无法读取 DNS 回答。', 'The DoH service returned an HTTP error; the DNS answer is unknown.'],
  'opaque-response': ['DoH 响应不可读取；无法判定解析结果。', 'The DoH response is unreadable; the resolution result is unknown.'],
  'browser-network-error': ['DoH 请求未完成；网络、TLS 或浏览器策略均可能相关。', 'DoH request failed; network, TLS or browser policy may be involved.'],
  'dns-answer': ['收到 DoH 回答；不代表业务连接成功。', 'DoH answer received; business connectivity is unverified.'],
  'dns-empty': ['DNS 查询完成，但该类型没有记录。', 'DNS query completed with no records of this type.'],
  'dns-error': ['解析器返回错误；不能单独判定服务中断。', 'Resolver returned an error; this alone does not prove an outage.'],
  'resource-loaded': ['图片已加载。此文件较小，且跨域传输字节数可能不可读；仅报告本次加载耗时，不将其换算成带宽。', 'Image loaded. This file is small and cross-origin transfer bytes may be hidden; load time is reported without claiming bandwidth.'],
  'resource-load-error': ['图片未能加载；浏览器未暴露具体网络阶段。', 'Image did not load; the browser did not expose the failing network stage.'],
  'timeout': ['达到等待时限，失败阶段未知。', 'Timed out; the failing stage is unknown.'],
  'cancelled': ['检测已停止。', 'Check stopped.'],
  'not-run': ['未执行。', 'Not run.'],
  'invalid-response': ['响应格式无效或超过大小上限。', 'Invalid or oversized response.'],
};

export function describe(result: Result, lang: Language): string {
  return codes[result.code]?.[lang === 'zh' ? 0 : 1] ?? strings[lang].incomplete;
}

export function protocolLabel(protocol: string, lang: Language): string {
  if (protocol === 'Resource/image') return lang === 'zh' ? '图片资源加载' : 'Image resource load';
  const [, resolver, type] = protocol.split('/');
  return `${resolver === 'cloudflare' ? 'Cloudflare' : 'Google'} · ${type === 'A' ? 'IPv4 (A)' : 'IPv6 (AAAA)'}`;
}

export function targetLabel(id: string, lang: Language): string {
  const labels: Record<string, [string, string]> = {
    'afizzy-site': ['Afizzy 官网', 'Afizzy Website'],
    'afizzy-api': ['Afizzy API', 'Afizzy API'],
    'thebetter-api': ['Thebetter API', 'Thebetter API'],
    'afizzy-resource-1801': ['Afizzy 图片资源', 'Afizzy image resource'],
  };
  return labels[id]?.[lang === 'zh' ? 0 : 1] ?? id;
}
