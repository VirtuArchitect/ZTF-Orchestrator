const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

// Capture only the local static demo; never use an authenticated live appliance.
const base = new URL(process.env.ZTF_SCREENSHOT_URL || 'http://127.0.0.1:15187/ZTF-Orchestrator/');
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) {
  throw new Error('Screenshot capture requires a local demo URL');
}
const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const output = path.join(root, 'docs', 'assets', 'readme', `v${version}`);
const screens = [
  ['dashboard', ''], ['yaml-studio', 'yaml-studio'], ['approvals', 'approvals'],
  ['jobs-queue', 'jobs'], ['validation-evidence', 'validation-evidence'],
  ['native-foundation-planning', 'workflows/native-foundation-deploy'],
  ['upgrade-advisor', 'upgrade-advisor'], ['workflow-catalog', 'workflows'],
];

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.ZTF_CHROME_PATH ? { executablePath: process.env.ZTF_CHROME_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1050 },
      deviceScaleFactor: 1, locale: 'en-GB', timezoneId: 'UTC' });
    // Demo API requests are intercepted in the app, not forwarded to any server.
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === base.origin && !url.pathname.startsWith('/api/')
        ? route.continue() : route.abort();
    });
    await context.addInitScript(() => localStorage.setItem('ztf-theme-mode', 'light'));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [name, route] of screens) {
      await page.goto(new URL(route, base).href, { waitUntil: 'networkidle' });
      await page.getByText('Demo mode: simulated data only. No Nutanix environment is connected and no workflows are executed.', { exact: true }).waitFor();
      await page.getByText(`ZeroTouch Orchestrator v${version}`, { exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, `${name}.png`) });
    }
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(`Captured ${screens.length} v${version} demo screens without browser errors.`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
