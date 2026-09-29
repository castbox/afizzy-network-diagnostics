import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
const root = new URL('../', import.meta.url);
const config = parse(await readFile(new URL('../config/network-diagnostics.yaml', import.meta.url), 'utf8'));
const seen = new Set();
if (config.schemaVersion !== 1 || !config.sources?.mobile?.commit || config.limits.concurrency < 1 || config.limits.concurrency > 3 || config.limits.dohTimeoutMs < 1000 || config.limits.dohTimeoutMs > 15000 || config.limits.resourceTimeoutMs < 1000 || config.limits.resourceTimeoutMs > 15000 || config.limits.runTimeoutMs > 60000) throw Error('Invalid catalog');
const approvedTargets = new Set(['afizzy-site', 'afizzy-api', 'thebetter-api', 'afizzy-resource-1801']);
if (config.targets.length !== approvedTargets.size) throw Error('Expected three domains and one image resource');
for (const target of config.targets) {
  const url = new URL(target.url);
  if (seen.has(target.id) || !approvedTargets.has(target.id)) throw Error('Invalid target identity');
  seen.add(target.id);
  if (target.id === 'afizzy-resource-1801') {
    if (url.href !== config.sources?.userProvided?.url || target.source !== 'userProvided' || target.review !== 'public-static-image-get' || target.referenceBytes !== 62515 || target.method !== 'GET' || !target.enabled || !Array.isArray(target.checks) || target.checks.length !== 1 || target.checks[0] !== 'image') throw Error('Unreviewed image resource');
  } else if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port || url.pathname !== '/' || target.method !== 'GET' || target.environment !== 'production' || !target.enabled || !config.sources[target.source]?.commit || target.review !== 'hostname-only-public-doh-get' || !Array.isArray(target.checks) || target.checks.length !== 1 || target.checks[0] !== 'doh') throw Error(`Unreviewed target: ${target.id}`);
}
if (config.resolvers.length !== 2) throw Error('Expected two reviewed DoH resolvers');
const seenResolvers = new Set();
for (const resolver of config.resolvers) {
  const url = new URL(resolver.url);
  const reviewed = { cloudflare: 'https://cloudflare-dns.com/dns-query', google: 'https://dns.google/resolve' };
  if (seenResolvers.has(resolver.id) || reviewed[resolver.id] !== url.href || url.username || url.password || url.search || url.hash || resolver.method !== 'GET' || resolver.review !== 'public-doh-json-get-no-credentials' || !resolver.source) throw Error(`Invalid resolver: ${resolver.id}`);
  seenResolvers.add(resolver.id);
}
for (const path of ['src/']) {
  await mkdir(new URL(path, root), { recursive: true });
  await writeFile(new URL(`${path}catalog.generated.json`, root), JSON.stringify(config, null, 2) + '\n');
}
console.log(`Catalog ${config.version}: ${config.targets.length} reviewed targets (${fileURLToPath(root)})`);
