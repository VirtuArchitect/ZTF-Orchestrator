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
for (const document of catalogue.documents) {
  if (!/^[a-z0-9-]+$/.test(document.id) || ids.has(document.id)) throw new Error('Invalid or duplicate document ID.');
  ids.add(document.id);
  const path = realpathSync(resolve(root, document.source));
  const local = relative(root, path);
  if (isAbsolute(local) || local.startsWith('..') || !local.replaceAll('\\', '/').startsWith('docs/') || !path.endsWith('.pdf')) throw new Error('PDF source must be inside docs.');
  const bytes = readFileSync(path);
  if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Invalid PDF source.');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== document.sha256 || bytes.length !== document.bytes) throw new Error(`Refresh library metadata for ${document.id}.`);
  document.pdf = `files/${basename(path)}`;
  copyFileSync(path, resolve(output, document.pdf));
  checksums.push(`${sha256}  ${document.pdf}`);
}
writeFileSync(resolve(output, 'library.json'), JSON.stringify(catalogue, null, 2) + '\n');
writeFileSync(resolve(output, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
console.log(`Built documentation library: ${catalogue.documents.length} verified PDFs.`);
