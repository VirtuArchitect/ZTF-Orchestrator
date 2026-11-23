import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const items = JSON.parse(readFileSync(resolve(root, 'src/public-site-navigation.json'), 'utf8'));
const css = readFileSync(resolve(root, 'src/public-site-navigation.css'), 'utf8').replaceAll('\r\n', '\n').trim();
const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const styles = `<!-- public-site-navigation:styles -->\n<style data-public-site-navigation>\n${css}\n</style>\n<!-- /public-site-navigation:styles -->`;
const pages = [
  ['docs/pages/project/index.html', './', 'home'],
  ['public/documentation/index.html', '../', 'documentation'],
  ['public/tutorials/index.html', '../', 'tutorials'],
  ['public/releases/index.html', '../', 'releases'],
];
const check = process.argv.includes('--check');
let stale = false;
for (const [name, prefix, active] of pages) {
  const links = items.map(item => {
    const href = item.path.startsWith('https://') ? item.path : prefix + item.path;
    const attributes = `${item.id === 'home' ? ' class="ztf-site-home"' : ''}${item.id === active ? ' aria-current="page"' : ''}`;
    return `        <a href="${escape(href)}"${attributes}>${escape(item.label)}${item.id === 'github' ? ' <span aria-hidden="true">↗</span>' : ''}</a>`;
  }).join('\n');
  const header = `<!-- public-site-navigation:start -->
<header class="ztf-site-header" aria-label="Public website" data-public-navigation>
  <div class="ztf-site-header-inner">
    <a class="brand ztf-site-brand" href="${prefix}" aria-label="ZTF-Orchestrator home"><img src="${prefix}zto-logo-mark.svg" width="34" height="34" alt="">ZTF-Orchestrator</a>
    <nav aria-label="Main navigation">
${links}
    </nav>
  </div>
</header>
<!-- public-site-navigation:end -->`;
  const file = resolve(root, name);
  const original = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  if (!original.includes('<!-- public-site-navigation:start -->') || !original.includes('<!-- public-site-navigation:styles -->')) throw new Error(`Missing navigation slots: ${name}`);
  const updated = original
    .replace(/<!-- public-site-navigation:styles -->[\s\S]*?<!-- \/public-site-navigation:styles -->/, styles)
    .replace(/<!-- public-site-navigation:start -->[\s\S]*?<!-- public-site-navigation:end -->/, header);
  if (updated !== original) {
    if (check) { console.error(`Refresh shared navigation: ${name}`); stale = true; }
    else writeFileSync(file, updated, 'utf8');
  }
}
if (stale) process.exitCode = 1;
