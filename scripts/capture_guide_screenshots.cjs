const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

// Only the isolated static demo is permitted. No production sessions or APIs.
const base = new URL(process.env.ZTF_SCREENSHOT_URL || 'http://127.0.0.1:15187/ZTF-Orchestrator/demo/');
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('A loopback demo URL is required');
const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const output = path.join(root, 'docs', 'assets', 'guide', `v${version}`);
const screens = [
  ['dashboard', 'overview'], ['setup', 'setup'], ['workflows', 'workflows'],
  ['workflows-2x', 'workflows-2x'], ['global-config', 'global-config'], ['configs', 'configs'],
  ['yaml-studio', 'yaml-studio'], ['scripts', 'scripts'], ['scripts-2x', 'scripts-2x'],
  ['executions', 'executions'], ['jobs', 'jobs'], ['pipelines', 'pipelines'],
  ['schedules', 'schedules'], ['parallel', 'parallel'], ['nkp', 'nkp'],
  ['approvals', 'approvals'], ['appliance', 'appliance'], ['upgrade-advisor', 'upgrade-advisor'],
  ['validation-evidence', 'validation-evidence'], ['drift', 'drift'], ['audit-log', 'audit-log'],
  ['users', 'users'], ['settings', 'settings'], ['ztf2-iac', 'ztf2-iac'],
  ['sessions', 'users', null, '@sessions'],
  ['session-revocation', 'users', '@revoke-session'],
  ['foundation-vm', 'workflows/cluster-create-foundation-vm'],
  ['foundation-images', 'workflows/cluster-create-foundation-vm', null, 'AHV ISO Checksum'],
  ['foundation-nodes', 'workflows/cluster-create-foundation-vm', null, 'Node Serial'],
  ['configure-cluster', 'workflows/config-cluster'],
  ['credential-rotation', 'workflows/cvm-idrac-password-rotation'],
  ['drift-edit', 'drift', '@edit-drift'],
  ['storage', 'settings', 'Storage'], ['connections', 'settings', 'Connection Profiles'],
  ['governance', 'settings', 'Governance'], ['notifications', 'settings', 'Notifications'],
  ['about', 'settings', 'About'], ['updates', 'appliance', 'Updates'],
  ['first-boot', 'appliance', 'First Boot'], ['nkp-readiness', 'appliance', 'NKP Readiness'],
  ['ztf-modes', 'appliance', 'ZTF Modes'],
  ['native-foundation', 'workflows/native-foundation-deploy'],
  ['start-here', 'start'], ['deployment-guide', 'start/deploy'],
  ['post-configuration', 'start/configure'],
  ['monitor-verify', 'start/monitor'], ['clusters', 'clusters'],
  ['disaster-recovery', 'recovery'],
  ['config-groups', 'configs', '@config-groups'],
  ['pipeline-config-groups', 'pipelines', '@pipeline-config-groups'],
  ['pe-login-title', 'scripts', '@login-title'],
];

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.ZTF_CHROME_PATH ? { executablePath: process.env.ZTF_CHROME_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1050 },
      deviceScaleFactor: 1, locale: 'en-GB', timezoneId: 'UTC' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === base.origin && !/\/api(?:\/|$)/.test(url.pathname)
        ? route.continue() : route.abort();
    });
    await context.addInitScript(() => localStorage.setItem('ztf-theme-mode', 'light'));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const selected = process.env.ZTF_SCREENSHOT_NAMES?.split(',');
    const captures = screens.filter(([name]) => !selected || selected.includes(name));
    for (const [name, route, tab, scroll] of captures) {
      await page.goto(new URL('start', base).href, { waitUntil: 'networkidle' });
      await page.evaluate(async target => {
        const groups = [{ id: 'dc1-cluster01', name: 'DEV_LAB', datacenter: 'DC1', kind: 'cluster' }, { id: 'shared-templates', name: 'Shared Templates', datacenter: '', kind: 'shared' }];
        const credential = await fetch('/api/credential-organization', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, revision: 0, groups, assignments: { pe_user: { groupId: 'dc1-cluster01', purpose: 'PE Administrator' } } }) });
        if (!credential.ok) throw new Error('Unable to seed isolated credential labels');
        const config = await fetch('/api/config-organization', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, revision: 0, assignments: { 'cluster-baseline-demo.yml': { groupId: 'dc1-cluster01', purpose: 'Post-configuration' }, 'pc-deploy-demo.yml': { groupId: 'shared-templates', purpose: 'Deployment' } } }) });
        if (!config.ok) throw new Error('Unable to seed isolated config labels');
        history.pushState({}, '', target); window.dispatchEvent(new PopStateEvent('popstate'));
      }, new URL(route, base).pathname);
      await page.getByText('Demo mode: simulated data only. No Nutanix environment is connected and no workflows are executed.', { exact: true }).waitFor();
      await page.getByText(`ZeroTouch Orchestrator v${version}`, { exact: true }).waitFor();
      if (name.startsWith('foundation-')) {
        // Enter a documentation-only classic installer endpoint through the form.
        await page.locator('input[value="https://foundation-demo.local:9440"]').fill('http://foundation.example.com:8000');
      }
      if (tab === '@config-groups') {
        await page.getByRole('button', { name: 'DEV_LAB', exact: true }).click();
        await page.getByText('cluster-baseline-demo.yml', { exact: true }).click();
      }
      else if (tab === '@pipeline-config-groups') {
        await page.getByRole('button', { name: 'Edit pipeline' }).first().click();
        await page.getByText('Filter config files by datacenter / cluster', { exact: true }).first().click();
        await page.getByRole('button', { name: 'DEV_LAB', exact: true }).first().click();
      }
      else if (tab === '@login-title') {
        await page.getByRole('button', { name: 'Prism Element', exact: true }).click();
        await page.getByPlaceholder('Search scripts...').fill('Set Prism Login Title');
        await page.getByRole('button', { name: /Set Prism Login Title \(PE\)/ }).click();
        await page.getByLabel('Prism Element IP', { exact: false }).fill('192.0.2.10');
        await page.getByLabel('Cluster Name', { exact: false }).fill('DEV_LAB');
        await page.getByLabel('PE Credential Ref', { exact: false }).fill('pe_user');
        await page.getByLabel('Prism Login Title', { exact: false }).fill('DEV_LAB');
        await page.getByRole('button', { name: 'Generate YAML' }).click();
      }
      else if (tab === '@revoke-session') {
        await page.getByTestId('sessions-panel').scrollIntoViewIfNeeded();
        await page.getByRole('button', { name: /^Revoke session / }).first().click();
      }
      else if (tab === '@edit-drift') await page.getByRole('button', { name: /^Edit schedule / }).first().click();
      else if (tab) await page.getByRole('button', { name: tab, exact: true }).click();
      if (name === 'about') await page.getByText(`v${version} / demo-build`, { exact: true }).waitFor();
      if (scroll === '@sessions') await page.getByTestId('sessions-panel').scrollIntoViewIfNeeded();
      else if (scroll) await page.getByText(scroll, { exact: true }).first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `${name}.png`) });
      console.log(`Captured ${name}`);
    }
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(`Captured ${captures.length} guide screens without browser errors.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
