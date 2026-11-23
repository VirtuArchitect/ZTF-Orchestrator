import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const base = 'https://virtuarchitect.github.io/ZTF-Orchestrator/';
const expected = ['Home', 'Current status', 'Capabilities', 'Demo', 'Resources', 'Documentation', 'Video tutorials', 'Releases', 'GitHub'];
const destinations = ['', '#status', '#capabilities', 'demo/', '#resources', 'documentation/', 'tutorials/', 'releases/', 'https://github.com/VirtuArchitect/ZTF-Orchestrator'].map(path => new URL(path, base).href);
for (const [file, path] of [['docs/pages/project/index.html', ''], ['public/documentation/index.html', 'documentation/'], ['public/tutorials/index.html', 'tutorials/'], ['public/releases/index.html', 'releases/']]) {
  test(`${path || 'home'} has the complete shared menu and root destinations`, () => {
    const html = readFileSync(new URL(file, root), 'utf8');
    const header = html.match(/<header[^>]*data-public-navigation[^>]*>([\s\S]*?)<\/header>/)?.[1];
    assert.ok(header);
    const nav = header.match(/<nav[^>]*>([\s\S]*?)<\/nav>/)[1];
    const links = [...nav.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    assert.deepEqual(links.map(link => link[2].replace(/<span[^>]*>.*?<\/span>/g, '').trim()), expected);
    assert.deepEqual(links.map(link => new URL(link[1], base + path).href), destinations);
    assert.equal((nav.match(/aria-current="page"/g) || []).length, 1);
    assert.match(nav, /href="(?:\.\/|\.\.\/)" class="ztf-site-home"/);
  });
}
test('generated navigation is current', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('scripts/build-public-navigation.mjs', root)), '--check'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
test('home section destinations exist and release CSP remains script free', () => {
  const home = readFileSync(new URL('docs/pages/project/index.html', root), 'utf8');
  for (const id of ['status', 'capabilities', 'resources']) assert.ok(home.includes(`id="${id}"`));
  const release = readFileSync(new URL('public/releases/index.html', root), 'utf8');
  assert.doesNotMatch(release, /<script\b/i);
  assert.match(release, /default-src 'none'/);
});
