import { test, expect } from '@playwright/test';

test('automatically checks three DoH hosts and the reviewed image from the browser', async ({ page }, testInfo) => {
  const external: string[] = [];
  const backendRequests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) backendRequests.push(request.url()); });
  await page.route(/^https:\/\//, route => {
    external.push(route.request().url());
    if (new URL(route.request().url()).hostname === 'd2p265uuh9lhx2.cloudfront.net') return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9qN7sAAAAASUVORK5CYII=', 'base64') });
    return route.fulfill({ status: 200, contentType: 'application/dns-json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ Status: 0, Answer: [{ type: 1, data: '203.0.113.1', TTL: 30 }] }) });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  expect(await page.locator('main').evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(page.viewportSize()!.width * 0.7);
  await page.screenshot({ path: testInfo.outputPath('initial.png'), fullPage: true });
  await expect(page.getByText(/检测完成|Check finished/)).toBeVisible();
  await expect(page.locator('.target-group')).toHaveCount(4);
  await expect(page.locator('.result')).toHaveCount(13);
  await page.locator('.result summary').first().click();
  await expect(page.getByText('203.0.113.1').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('results.png'), fullPage: true });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /下载完整日志 JSON|Download full JSON log/ }).click();
  const report = JSON.parse(await (await import('node:fs/promises')).readFile(await (await pending).path(), 'utf8'));
  expect(report.results).toHaveLength(13);
  expect(new Set(report.results.map((result: { targetId: string }) => result.targetId))).toEqual(new Set(['afizzy-site', 'afizzy-api', 'thebetter-api', 'afizzy-resource-1801']));
  expect(report.results.every((result: { source: string; protocol: string }) => result.source === 'browser' && (result.protocol.startsWith('DoH/') || result.protocol === 'Resource/image'))).toBe(true);
  expect(report.results.find((result: { targetId: string }) => result.targetId === 'afizzy-resource-1801')).toMatchObject({ status: 'observed', code: 'resource-loaded', metrics: { referenceBytes: 62515, byteVisibility: 'unavailable' } });
  expect(external).toHaveLength(13);
  expect(external.filter(url => new URL(url).hostname === 'd2p265uuh9lhx2.cloudfront.net')).toHaveLength(1);
  expect(external.every(url => ['cloudflare-dns.com', 'dns.google', 'd2p265uuh9lhx2.cloudfront.net'].includes(new URL(url).hostname))).toBe(true);
  expect(backendRequests).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('stopping marks remaining DoH queries incomplete and keeps the report', async ({ page }) => {
  await page.route(/^https:\/\//, async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ Status: 0, Answer: [] }) }).catch(() => {});
  });
  await page.goto('/');
  await page.getByRole('button', { name: /停止|Stop/ }).click();
  await expect(page.getByText(/检测完成|Check finished/)).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /下载完整日志 JSON|Download full JSON log/ }).click();
  const report = JSON.parse(await (await import('node:fs/promises')).readFile(await (await pending).path(), 'utf8'));
  expect(report.results).toHaveLength(13);
  expect(report.results.some((result: { status: string }) => result.status === 'cancelled')).toBe(true);
  expect(report.events.some((event: { type: string }) => event.type === 'run-cancelled')).toBe(true);
});
