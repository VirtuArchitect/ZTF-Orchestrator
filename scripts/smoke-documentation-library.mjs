import { chromium, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const base = process.argv[2] || 'http://127.0.0.1:8773/ZTF-Orchestrator/documentation/';
const output = resolve(process.argv[3] || 'test-results/documentation-library');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  const catalogueResponse = await page.request.get(new URL('library.json', base).href);
  expect(catalogueResponse.status()).toBe(200);
  const catalogue = await catalogueResponse.json();
  const current = catalogue.documents.filter(item => !item.archived);
  const archived = catalogue.documents.filter(item => item.archived);
  await expect(page.locator('.document')).toHaveCount(current.length);
  await expect(page.locator('#document-title')).toHaveText(catalogue.documents[0].title);
  const registerResponse = await page.request.get(new URL('collection-register.json', base).href);
  expect(registerResponse.status()).toBe(200);
  const register = await registerResponse.json();
  expect(register.applicationSource).toBe(catalogue.applicationSource);
  const checksums = await (await page.request.get(new URL('SHA256SUMS.txt', base).href)).text();
  const covers = new Set();
  const tutorials = new Set();
  // Verify every packaged PDF using the public response and every deep-link binding.
  for (const item of catalogue.documents) {
    const response = await page.request.get(new URL(item.pdf, base).href, { timeout: 90000 });
    expect(response.status(), item.id).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    const body = await response.body();
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(body.length, item.id).toBe(item.bytes);
    expect(digest(body), item.id).toBe(item.sha256);
    expect(checksums).toContain(`${item.sha256}  ${item.pdf}`);
    await response.dispose();
    await page.goto(`${base}?doc=${item.id}`);
    await expect(page.locator('#document-title')).toHaveText(item.title);
    await expect(page.locator('#open')).toHaveAttribute('href', item.pdf);
    await expect(page.locator('#download')).toHaveAttribute('href', item.pdf);
    await expect(page.locator('#pdf')).toHaveAttribute('src', `${item.pdf}#view=FitH`);
    const cover = item.coverFile || item.id + '.jpg';
    if (!covers.has(cover)) {
      expect((await page.request.get(new URL(`covers/${cover}`, base).href)).status()).toBe(200);
      covers.add(cover);
    }
    if (item.tutorial !== undefined) tutorials.add(item.tutorial);
    const download = process.env.VERIFY_ALL_DOWNLOADS === '1' || ['collection-overview', 'current-workflow-script-collection', 'admin-guide', 'quick-guides-operations-create-virtual-switch', 'remote-ahv-deployment-design', 'remote-ahv-pilot-test-plan', 'production-disk-expansion', archived[0]?.id].includes(item.id);
    if (download) {
      const event = page.waitForEvent('download', { timeout: 90000 });
      await page.locator('#download').click();
      const file = await event;
      expect(await file.failure()).toBeNull();
      expect(digest(readFileSync(await file.path()))).toBe(item.sha256);
      await file.delete();
    }
    results.push({ id: item.id, sha256: item.sha256, bytes: body.length, download });
  }
  for (const part of tutorials) expect((await page.request.get(new URL(`../tutorials/?part=${part}`, base).href)).status()).toBe(200);
  await page.goto(base);
  await page.locator('#search').fill('no-such-guide-987654');
  await expect(page.locator('#empty')).toBeVisible();
  await page.locator('#search').fill('');
  for (const type of ['guide', 'task', 'reference', 'design']) {
    await page.locator('#document-type').selectOption(type);
    await expect(page.locator('.document')).toHaveCount(current.filter(item => type === 'design' ? ['design', 'pilot'].includes(item.kind) : (item.kind || 'guide') === type).length);
  }
  await page.locator('#document-type').selectOption('all');
  await page.locator('#category').selectOption('Recovery');
  await expect(page.locator('.document')).toHaveCount(current.filter(item => item.category === 'Recovery').length);
  await page.locator('#category').selectOption('all');
  await page.locator('#archive').check();
  await expect(page.locator('.document')).toHaveCount(catalogue.documents.length);
  await page.goto(`${base}?doc=../../untrusted.pdf`);
  await expect(page.locator('#document-title')).toHaveText(catalogue.documents[0].title);
  await page.locator('#pdf').scrollIntoViewIfNeeded();
  await expect.poll(() => page.frames().some(frame => frame.url().startsWith('chrome-extension://')), { timeout: 30000 }).toBe(true);
  let viewer = page.frames().find(frame => frame.url().startsWith('chrome-extension://'));
  await expect(viewer.locator('viewer-toolbar')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: resolve(output, 'documentation-library-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await expect(page.locator('.document')).toHaveCount(current.length);
  await page.locator('.document').nth(1).click();
  await expect(page.locator('#reader')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#pdf').scrollIntoViewIfNeeded();
  await expect.poll(() => page.frames().some(frame => frame.url().startsWith('chrome-extension://')), { timeout: 30000 }).toBe(true);
  viewer = page.frames().find(frame => frame.url().startsWith('chrome-extension://'));
  await expect(viewer.locator('viewer-toolbar')).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(output, 'documentation-library-mobile.png'), fullPage: true });
  await page.route('**/library.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto(base);
  await expect(page.locator('#error')).toBeVisible();
  await page.unroute('**/library.json');
  await page.route('**/library.json', route => route.fulfill({ json: { documents: [{ id: 'unsafe', pdf: '../../untrusted.pdf' }] } }));
  await page.goto(base);
  await expect(page.locator('#error')).toBeVisible();
  expect(errors).toEqual([]);
  writeFileSync(resolve(output, 'verification.json'), JSON.stringify({ base, applicationSource: catalogue.applicationSource, current: current.length, historical: archived.length, documents: results, errors }, null, 2));
  console.log(`Passed: ${results.length} PDF responses, sizes, hashes and deep links; ${results.filter(row => row.download).length} actual downloads; topics/types/search/history, native reader, mobile focus/layout and failure fallback.`);
} finally {
  await browser.close();
}
