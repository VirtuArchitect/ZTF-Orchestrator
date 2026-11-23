import { test } from 'node:test';
import './documentation-addresses.test.cjs';
import './public-site-navigation.test.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const hash = value => createHash('sha256').update(value).digest('hex');
function fixture(t, transform = () => {}) {
  const root = mkdtempSync(resolve(tmpdir(), 'documentation-package-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ['scripts', 'public/documentation/covers', 'docs/manuals/current']) mkdirSync(resolve(root, path), { recursive: true });
  copyFileSync(new URL('../scripts/build-documentation-library.mjs', import.meta.url), resolve(root, 'scripts/build-documentation-library.mjs'));
  for (const name of ['index.html', 'library.css', 'library.js']) writeFileSync(resolve(root, 'public/documentation', name), 'fixture');
  writeFileSync(resolve(root, 'public/documentation/covers/guide.jpg'), 'fixture');
  writeFileSync(resolve(root, 'docs/manuals/current/collection-register.json'), '{}');
  const pdf = Buffer.from('%PDF-1.7\nfixture');
  writeFileSync(resolve(root, 'docs/manuals/current/guide.pdf'), pdf);
  writeFileSync(resolve(root, 'docs/guide.md'), '# Guide\r\n\r\nReviewed source.\r\n');
  const documents = [{ id: 'guide', source: 'docs/manuals/current/guide.pdf', archived: false, sha256: hash(pdf), bytes: pdf.length,
    inputSources: [{ path: 'docs/guide.md', normalization: 'utf8-lf', sha256: hash('# Guide\n\nReviewed source.\n') }] }];
  transform(documents, root);
  writeFileSync(resolve(root, 'public/documentation/library.json'), JSON.stringify({ documents }));
  return spawnSync(process.execPath, [resolve(root, 'scripts/build-documentation-library.mjs'), resolve(root, 'output')], { encoding: 'utf8' });
}

test('normalises checkout line endings before source verification', t => {
  const result = fixture(t);
  assert.equal(result.status, 0, result.stderr);
});
test('rejects a changed current source', t => {
  const result = fixture(t, (_, root) => writeFileSync(resolve(root, 'docs/guide.md'), 'changed'));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /source content has changed/);
});
test('preserves frozen historical source provenance', t => {
  const result = fixture(t, (docs, root) => { docs[0].archived = true; writeFileSync(resolve(root, 'docs/guide.md'), 'new current source'); });
  assert.equal(result.status, 0, result.stderr);
});
test('still rejects changed historical PDF bytes', t => {
  const result = fixture(t, (docs, root) => { docs[0].archived = true; writeFileSync(resolve(root, docs[0].source), '%PDF-1.7\nchanged'); });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refresh library metadata/);
});
test('rejects source traversal outside the repository', t => {
  const result = fixture(t, docs => { docs[0].inputSources[0].path = '../'; });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Source must remain inside/);
});
test('rejects duplicate output filenames', t => {
  const result = fixture(t, (docs, root) => {
    docs.push({ ...docs[0], id: 'second', coverFile: 'guide.jpg', source: 'docs/guide.pdf' });
    copyFileSync(resolve(root, docs[0].source), resolve(root, 'docs/guide.pdf'));
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Duplicate PDF filename/);
});
