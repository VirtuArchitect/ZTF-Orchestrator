const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
const modules = process.env.DOCUMENTATION_TOOL_MODULES;
if (!modules) throw new Error('Set DOCUMENTATION_TOOL_MODULES to the provided authoring toolkit.');
const { chromium } = require(path.join(modules, 'playwright'));
const output = path.resolve(process.env.DOCUMENTATION_RENDER_DIR || path.join(root, 'output/documentation-render'));
fs.mkdirSync(output, { recursive: true });
const plan = JSON.parse(fs.readFileSync(path.join(root, 'docs/manuals/current/collection-plan.json'), 'utf8'));
const version = 'v' + JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const publicBase = 'https://virtuarchitect.github.io/ZTF-Orchestrator/documentation/';
const sourceBase = 'https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/main/';
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const selected = new Map(plan.items.map(item => [item.sourceDocument, item]));
const all = [];

function localTarget(source, href) {
  let target = path.resolve(root, path.dirname(source), decodeURIComponent(href.split('#')[0]));
  if (fs.existsSync(target)) target = fs.realpathSync(target);
  const relative = path.relative(root, target);
  if (path.isAbsolute(relative) || relative.startsWith('..')) return null;
  return { target, relative: relative.replaceAll('\\', '/') };
}

function referenceScope(item) {
  if (item.archived) return 'Historical reference. Current console availability follows the retirement and operating guidance in the current collection.';
  if (item.category === 'Native Foundation reference') return 'Planning and review API reference. A successful review does not enable hardware mutation. The separate controlled-UAT adapter path requires its own deployment gates, exact intent approval and target validation. This workflow is distinct from the retired Native pipeline executor option.';
  if (item.category === 'Testing and governance') return 'Source guidance, review criteria or test template. Test plans and documented controls do not establish completed hardware or production validation.';
  if (item.kind === 'task') return 'Source-reviewed task procedure. Simulated screenshots show authoring states. Confirm the installed build, exact target and required approvals before use.';
  return 'Reviewed against application source 48eb875. Match the guide to the installed build and retain the procedure-specific approval and validation boundaries.';
}

(async () => {
  const { marked, Renderer } = await import(pathToFileURL(path.join(modules, 'marked/lib/marked.esm.js')).href);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route('**/*', route => route.abort());
    const filter = process.argv[2];
    for (const item of plan.items) {
      if (filter && !item.id.includes(filter)) continue;
      const applicationSource = item.applicationSource || plan.applicationSource;
      const reviewed = item.reviewed || plan.reviewed;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewed)) throw new Error('Invalid review date.');
      const reviewDate = new Date(reviewed + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
      if (!/^[0-9a-f]{40}$/.test(applicationSource)) throw new Error('Invalid application source.');
      const sourceShort = applicationSource.slice(0, 7);
      if (!/^[a-z0-9-]+$/.test(item.id)) throw new Error('Invalid document ID.');
      const sourceFile = fs.realpathSync(path.resolve(root, item.sourceDocument));
      const sourceRelative = path.relative(root, sourceFile);
      if (path.isAbsolute(sourceRelative) || sourceRelative.startsWith('..') || !sourceFile.endsWith('.md')) throw new Error('Markdown source must remain inside the repository.');
      const markdown = fs.readFileSync(sourceFile, 'utf8').replace(/\u2014/g, ':');
      const sources = [{ path: item.sourceDocument, sha256: digest(fs.readFileSync(sourceFile).toString('utf8').replace(/\r\n/g, '\n')), normalization: 'utf8-lf' }];
      const renderer = Object.assign(new Renderer(), {
        html(token) { return escape(token.text); },
        heading(token) {
          const id = token.text.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/\s+/g, '-');
          return `<h${token.depth} id="${escape(id)}">${this.parser.parseInline(token.tokens)}</h${token.depth}>`;
        },
        link(token) {
          let href = token.href || '';
          if (href.startsWith('#')) return `<a href="${escape(href)}">${this.parser.parseInline(token.tokens)}</a>`;
          if (!/^https?:\/\//.test(href)) {
            const target = localTarget(item.sourceDocument, href);
            if (!target || !fs.existsSync(target.target)) return this.parser.parseInline(token.tokens);
            const document = selected.get(target.relative);
            href = document ? publicBase + '?doc=' + document.id : sourceBase + target.relative;
          }
          return `<a href="${escape(href)}">${this.parser.parseInline(token.tokens)}</a>`;
        },
        image(token) {
          const target = localTarget(item.sourceDocument, token.href || '');
          if (!target || !fs.existsSync(target.target) || !/\.(png|jpe?g|svg|webp)$/i.test(target.target)) return `<p>Illustration: ${escape(token.text)}. Refer to the source document for the original external figure.</p>`;
          const bytes = fs.readFileSync(target.target);
          if (!sources.some(source => source.path === target.relative)) sources.push({ path: target.relative, sha256: digest(bytes), normalization: 'binary' });
          const extension = path.extname(target.target).slice(1).toLowerCase();
          const mime = extension === 'svg' ? 'image/svg+xml' : extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
          return `<figure><img src="data:${mime};base64,${bytes.toString('base64')}" alt="${escape(token.text)}"><figcaption>${escape(token.text)}</figcaption></figure>`;
        },
      });
      let body = marked.parse(markdown, { renderer, gfm: true });
      body = body.replace(/<p>(<figure>[\s\S]*?<\/figure>)<\/p>/g, '$1');
      body = body.replace(/(<figure>[\s\S]*?)<\/figure>\s*(<p>Simulated initial\/authoring[\s\S]*?<\/p>)/g, '$1$2</figure>');
      const scope = referenceScope(item).replaceAll('48eb875', sourceShort);
      body = body.replace('</h1>', `</h1><p class="provenance">${version} · Source checked ${reviewDate} · Application source ${sourceShort}</p><p class="scope">${escape(scope)}</p>`);
      const maximumColumns = Math.max(0, ...markdown.split('\n').filter(line => /^\|[- :|]+\|\s*$/.test(line)).map(line => line.split('|').length - 2));
      const landscape = maximumColumns > 6;
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(item.title)}</title><style>
      @page{size:Letter ${landscape ? 'landscape' : 'portrait'};margin:70pt 51pt 50pt 49pt}
      *{box-sizing:border-box}body{font:11pt/1.38 Arial,sans-serif;color:#000;margin:0}h1{font-size:20pt;line-height:1.2;margin:0 0 12pt}h2{font-size:15pt;line-height:1.25;margin:18pt 0 8pt}h3{font-size:12pt;margin:14pt 0 6pt}h4{font-size:11pt;margin:12pt 0 6pt}h1,h2,h3,h4{color:#000;break-after:avoid}p{margin:0 0 8pt;orphans:3;widows:3}a{color:#17365D;text-decoration:underline}ul,ol{padding-left:20pt;margin:6pt 0 12pt}li{margin:0 0 5pt}table{border-collapse:collapse;table-layout:fixed;width:100%;font-size:10pt;margin:10pt 0 14pt}thead{display:table-header-group}th{background:#17365D;color:white;font-weight:bold}th,td{border:1px solid #D9D9D9;padding:6pt;vertical-align:middle;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#F3F6FA}tr{break-inside:avoid}code{font-family:Consolas,monospace;font-size:9pt;overflow-wrap:anywhere}pre{font:9pt/1.35 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;background:#f5f6f8;border:1px solid #d9d9d9;padding:8pt;margin:9pt 0 12pt}pre code{font:inherit}figure{margin:12pt 0;break-inside:avoid}img{display:block;max-width:100%;max-height:${landscape ? '340' : '490'}pt;object-fit:contain;margin:auto}figcaption{font:9pt/1.3 Arial,sans-serif;margin-top:6pt;color:#33485c}blockquote{margin:8pt 0;padding:0}.provenance{font-size:9pt;color:#33485c}.scope{font-size:10pt;color:#33485c;margin-bottom:16pt}hr{border:0;border-top:1px solid #d9d9d9}
      </style></head><body>${body}</body></html>`;
      const page = await context.newPage();
      await page.goto('about:blank');
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(async () => Promise.all([...document.images].map(image => image.decode())));
      const visibleText = await page.locator('body').innerText();
      await page.pdf({ path: path.join(output, item.id + '-body.pdf'), printBackground: true, preferCSSPageSize: true, tagged: true, outline: true });
      fs.writeFileSync(path.join(output, item.id + '.html'), html);
      fs.writeFileSync(path.join(output, item.id + '.txt'), visibleText);
      const record = { ...item, scope, inputSources: sources, landscape, applicationSource, reviewed };
      fs.writeFileSync(path.join(output, item.id + '.json'), JSON.stringify(record, null, 2) + '\n');
      all.push(record);
      await page.close();
      console.log(item.id);
    }
    fs.writeFileSync(path.join(output, 'rendered-index.json'), JSON.stringify(all, null, 2) + '\n');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
