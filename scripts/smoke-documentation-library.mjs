import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const base = process.argv[2] || 'http://127.0.0.1:8773/documentation/';
const output = resolve(process.argv[3] || 'test-results/documentation-library');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await expect(page.locator('.document')).toHaveCount(7);
  await expect(page.locator('#document-title')).toHaveText('Workflow and Script Quick Guides: Illustrated');
  const catalogue = await (await page.request.get(new URL('library.json', base).href)).json();
  for (const item of catalogue.documents) {
    const response = await page.request.get(new URL(item.pdf, base).href);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect(createHash('sha256').update(await response.body()).digest('hex')).toBe(item.sha256);
    await page.goto(`${base}?doc=${item.id}`);
    await expect(page.locator('#document-title')).toHaveText(item.title);
    await expect(page.locator('#open')).toHaveAttribute('href', item.pdf);
    await expect(page.locator('#download')).toHaveAttribute('href', item.pdf);
    await expect(page.locator('#pdf')).toHaveAttribute('src', `${item.pdf}#view=FitH`);
    expect((await page.request.get(new URL(`covers/${item.id}.jpg`, base).href)).status()).toBe(200);
    if (item.tutorial !== undefined) {
      const tutorial = await page.request.get(new URL(`../tutorials/?part=${item.tutorial}`, base).href);
      expect(tutorial.status()).toBe(200);
    }
  }
  await page.goto(base);
  await expect(page.locator('.document')).toHaveCount(7);
  await page.locator('#search').fill('uplink');
  await expect(page.locator('.document')).toHaveCount(1);
  await page.locator('#search').fill('no-such-guide');
  await expect(page.locator('#empty')).toBeVisible();
  await page.locator('#search').fill('');
  await page.locator('#category').selectOption('Recovery');
  await expect(page.locator('.document')).toHaveCount(1);
  await page.locator('.document').click();
  await expect(page.locator('#document-title')).toHaveText('Datacenter and Recovery Cluster Profile Setup');
  await page.locator('#category').selectOption('all');
  await page.locator('#archive').check();
  await expect(page.locator('.document')).toHaveCount(10);
  await page.goto(`${base}?doc=../../untrusted.pdf`);
  await expect(page.locator('#document-title')).toHaveText('Workflow and Script Quick Guides: Illustrated');
  await page.locator('#pdf').scrollIntoViewIfNeeded();
  await expect.poll(() => page.frames().some(frame => frame.url().startsWith('chrome-extension://'))).toBe(true);
  const viewer = page.frames().find(frame => frame.url().startsWith('chrome-extension://'));
  await expect(viewer.locator('viewer-toolbar')).toBeVisible();
  // Chrome paints the native PDF surface after its accessible toolbar appears.
  await page.waitForTimeout(2500);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: resolve(output, 'documentation-library-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await expect(page.locator('.document')).toHaveCount(7);
  await page.locator('.document').nth(1).click();
  await expect(page.locator('#reader')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#pdf').scrollIntoViewIfNeeded();
  await expect.poll(() => page.frames().some(frame => frame.url().startsWith('chrome-extension://'))).toBe(true);
  const mobileViewer = page.frames().find(frame => frame.url().startsWith('chrome-extension://'));
  await expect(mobileViewer.locator('viewer-toolbar')).toBeVisible();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: resolve(output, 'documentation-library-mobile.png'), fullPage: true });
  await page.route('**/library.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto(base);
  await expect(page.locator('#error')).toBeVisible();
  await page.unroute('**/library.json');
  expect(errors).toEqual([]);
  console.log('Passed: 10 PDF hashes/links, cover images, tutorial links, search, topics, archive/deep links, mobile focus/layout and failure fallback.');
} finally {
  await browser.close();
}
