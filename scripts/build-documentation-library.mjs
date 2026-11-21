import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, realpathSync } from 'node:fs';
import { resolve, dirname, basename, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'public/documentation');
const output = resolve(process.argv[2] || resolve(root, 'dist-demo/documentation'));
if (output === root || output === source) throw new Error('Use a separate build output directory.');
const catalogue = JSON.parse(readFileSync(resolve(source, 'library.json'), 'utf8'));
mkdirSync(resolve(output, 'files'), { recursive: true });
mkdirSync(resolve(output, 'covers'), { recursive: true });
for (const name of ['index.html', 'library.css', 'library.js']) copyFileSync(resolve(source, name), resolve(output, name));
for (const name of readdirSync(resolve(source, 'covers'))) copyFileSync(resolve(source, 'covers', name), resolve(output, 'covers', name));
const checksums = [];
const ids = new Set();
const filenames = new Set();
const inputDigests = new Map();
const rootSources = new Set(['SECURITY.md', 'CONTRIBUTING.md', 'RELEASE.md', 'TESTING_GUIDE.md', 'appliance-update-console-recovery.md']);
function containedSource(relativePath) {
  const path = realpathSync(resolve(root, relativePath));
  const local = relative(root, path);
  if (isAbsolute(local) || local.startsWith('..')) throw new Error('Source must remain inside the repository.');
  const name = local.replaceAll('\\', '/');
  if (!name.startsWith('docs/') && !rootSources.has(name)) throw new Error('Source is outside the documentation allowlist.');
  return path;
}
for (const document of catalogue.documents) {
  if (!/^[a-z0-9-]+$/.test(document.id) || ids.has(document.id)) throw new Error('Invalid or duplicate document ID.');
  ids.add(document.id);
  const path = containedSource(document.source);
  const local = relative(root, path);
  if (isAbsolute(local) || local.startsWith('..') || !local.replaceAll('\\', '/').startsWith('docs/') || !path.endsWith('.pdf')) throw new Error('PDF source must be inside docs.');
  const bytes = readFileSync(path);
  if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Invalid PDF source.');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== document.sha256 || bytes.length !== document.bytes) throw new Error(`Refresh library metadata for ${document.id}.`);
  for (const input of document.archived ? [] : (document.inputSources || [])) {
    if (!['utf8-lf', 'binary'].includes(input.normalization)) throw new Error('Unknown source normalization.');
    const key = `${input.normalization}:${input.path}`;
    if (!inputDigests.has(key)) {
      let content = readFileSync(containedSource(input.path));
      if (input.normalization === 'utf8-lf') content = Buffer.from(content.toString('utf8').replaceAll('\r\n', '\n'), 'utf8');
      inputDigests.set(key, createHash('sha256').update(content).digest('hex'));
    }
    if (inputDigests.get(key) !== input.sha256) throw new Error(`Re-export ${document.id}: source content has changed.`);
  }
  const coverFile = document.coverFile || `${document.id}.jpg`;
  if (!/^[a-z0-9-]+\.jpg$/.test(coverFile)) throw new Error('Invalid cover path.');
  readFileSync(resolve(source, 'covers', coverFile));
  if (filenames.has(basename(path))) throw new Error('Duplicate PDF filename.');
  filenames.add(basename(path));
  document.pdf = `files/${basename(path)}`;
  copyFileSync(path, resolve(output, document.pdf));
  checksums.push(`${sha256}  ${document.pdf}`);
}
writeFileSync(resolve(output, 'library.json'), JSON.stringify(catalogue, null, 2) + '\n');
writeFileSync(resolve(output, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
copyFileSync(resolve(root, 'docs/manuals/current/collection-register.json'), resolve(output, 'collection-register.json'));
console.log(`Built documentation library: ${catalogue.documents.length} verified PDFs.`);
