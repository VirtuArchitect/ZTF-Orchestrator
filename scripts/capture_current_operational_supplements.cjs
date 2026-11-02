// Isolated static-demo documentation captures on loopback port 15221. No live APIs or execution.
const { chromium } = require('@playwright/test');
const path = require('node:path');
(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, locale: 'en-GB', timezoneId: 'UTC' });
    await context.route('**/*', r => { const u = new URL(r.request().url()); return u.origin === 'http://127.0.0.1:15221' && !/\/api(?:\/|$)/.test(u.pathname) ? r.continue() : r.abort(); });
    await context.addInitScript(() => localStorage.setItem('ztf-theme-mode', 'light'));
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:15221/ZTF-Orchestrator/start');
    await page.evaluate(() => { const original = window.fetch; window.fetch = async (input, init) => { const p = new URL(typeof input === 'string' ? input : input.url, location.origin).pathname; if (p === '/api/appliance/updates/control') {
        return new Response(JSON.stringify({ available: true, maintenance: true, operation: { id: 'simulated-operation', action: 'install', status: 'running', stage: 'load', message: 'Simulated progress only. No appliance is updated.', events: ['readiness', 'backup', 'load'].map(stage => ({ stage, message: 'Simulated ' + stage, at: 1 })) } }), { headers: { 'Content-Type': 'application/json' } });
    } return original(input, init); }; history.pushState({}, '', '/ZTF-Orchestrator/appliance'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await page.getByRole('button', { name: 'Updates', exact: true }).click();
    await page.getByText('Operation: install · running', { exact: true }).waitFor();
    await page.getByText('Operation: install · running', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.resolve('docs/assets/guide/v1.8.5-rc1/update-progress.png') });
    await page.goto('http://127.0.0.1:15221/ZTF-Orchestrator/start');
    await page.evaluate(() => { const original = window.fetch; const dc = { id: 'dc1', name: 'Datacenter Alpha', foundationEndpoint: 'http://foundation.example.com:8000', notes: 'Reviewed runbook and isolated recovery network', prerequisites: { network: 'reviewed', images: 'reviewed', credentials: 'reviewed', dnsNtp: 'reviewed', backupAccess: 'reviewed' } }; const revision = { revision: 1, sha256: 'a'.repeat(64), deploymentConfigFile: 'cluster-baseline-demo.yml', deploymentContent: 'foundation_vm_ip: foundation.example.com\n# Abbreviated simulated configuration only\n', clusterName: 'HCI-CLUSTER-01', clusterVip: '192.0.2.20', targets: ['NODE01', 'NODE02', 'NODE03', 'NODE04'], steps: [{ workflow: 'config-cluster', configFile: 'cluster-baseline-demo.yml', configContent: 'clusters: {}\n', sha256: 'b'.repeat(64) }], pipelineName: 'Post-deployment baseline (simulated)', approvedBy: 'demo-reviewer', approvedAt: '2026-11-02T08:00:00Z' }; const profile = { id: 'profile1', name: 'HCI-CLUSTER-01', datacenterId: 'dc1', kind: 'existing', revision: 1, reviewed: true, drifted: false, deploymentConfigFile: 'cluster-baseline-demo.yml', pipelineId: 'demo-pipeline-001', revisions: [revision] }; window.fetch = async (input, init) => { const p = new URL(typeof input === 'string' ? input : input.url, location.origin).pathname; if (p === '/api/recovery' || p === '/api/recovery/profiles/profile1') {
        if (init?.method && init.method !== 'GET')
            throw new Error('Documentation capture cannot save or execute recovery');
        return new Response(JSON.stringify(p === '/api/recovery' ? { datacenters: [dc], profiles: [profile], runs: [] } : profile), { headers: { 'Content-Type': 'application/json' } });
    } return original(input, init); }; history.pushState({}, '', '/ZTF-Orchestrator/recovery'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await page.getByRole('button', { name: 'Add Datacenter', exact: true }).filter({ visible: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Datacenter name').fill('Datacenter Beta');
    await dialog.getByLabel('Foundation VM endpoint').fill('http://foundation-beta.example.com:8000');
    await dialog.getByLabel('Recovery dependencies and runbook notes').fill('Review images, certificate trust, addressing, credentials and backup access.');
    await page.screenshot({ path: path.resolve('docs/assets/disaster-recovery/setup-v1.8.5-rc1/01-add-datacenter.png') });
    await page.getByRole('button', { name: 'Close recovery dialog' }).click();
    await page.getByRole('button', { name: 'Create Recovery Profile', exact: true }).filter({ visible: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Profile name').fill('HCI-CLUSTER-01 Recovery');
    await dialog.locator('select').nth(2).selectOption('cluster-baseline-demo.yml');
    await dialog.locator('select').nth(3).selectOption('demo-pipeline-001');
    await page.screenshot({ path: path.resolve('docs/assets/disaster-recovery/setup-v1.8.5-rc1/02-linked-profile.png') });
    await page.getByRole('button', { name: 'Close recovery dialog' }).click();
    await page.getByRole('button', { name: 'Review Profile', exact: true }).first().click();
    await page.getByText('NODE01', { exact: false }).first().waitFor();
    await page.screenshot({ path: path.resolve('docs/assets/disaster-recovery/setup-v1.8.5-rc1/03-reviewed-baseline.png') });
    await browser.close();
    console.log('Captured update progress and three recovery setup views without deployment.');
})().catch(e => { console.error(e); process.exitCode = 1; });
