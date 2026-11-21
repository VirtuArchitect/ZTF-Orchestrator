const byId = id => document.getElementById(id);
const search = byId('search');
const category = byId('category');
const archive = byId('archive');
const list = byId('documents');
let documents = [];
let selected;

function selectDocument(item, updateUrl = true, moveFocus = false) {
  selected = item.id;
  byId('reader').hidden = false;
  byId('document-title').textContent = item.title;
  byId('document-category').textContent = item.category;
  byId('description').textContent = item.description;
  byId('metadata').textContent = `${item.pages} pages · ${(item.bytes / 1048576).toFixed(1)} MiB · ${item.edition}`;
  byId('scope').textContent = item.scope;
  byId('checksum').textContent = item.sha256;
  byId('cover').src = `covers/${item.id}.jpg`;
  byId('cover').alt = `${item.title}: original PDF cover`;
  byId('open').href = item.pdf;
  byId('download').href = item.pdf;
  byId('download').download = item.pdf.split('/').pop();
  byId('source').href = `https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/main/${item.source}`;
  byId('pdf').src = `${item.pdf}#view=FitH`;
  byId('pdf').title = `${item.title} PDF preview`;
  byId('tutorial').hidden = item.tutorial === undefined;
  if (item.tutorial !== undefined) byId('tutorial').href = `../tutorials/?part=${item.tutorial}`;
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set('doc', item.id);
    history.replaceState(null, '', url);
  }
  for (const button of list.children) button.setAttribute('aria-current', String(button.dataset.id === selected));
  if (moveFocus && matchMedia('(max-width: 850px)').matches) {
    byId('reader').focus({ preventScroll: true });
    byId('reader').scrollIntoView({ block: 'start' });
  }
}

function filterDocuments() {
  const words = search.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const visible = documents.filter(item => (archive.checked || !item.archived) &&
    (category.value === 'all' || item.category === category.value) &&
    words.every(word => `${item.title} ${item.description} ${item.tags.join(' ')}`.toLocaleLowerCase().includes(word)));
  list.replaceChildren();
  for (const item of visible) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'document';
    button.dataset.id = item.id;
    button.setAttribute('aria-current', String(selected === item.id));
    const title = document.createElement('strong');
    title.textContent = item.title;
    const detail = document.createElement('span');
    detail.textContent = `${item.category} · ${item.pages} pages${item.archived ? ' · Previous edition': ''}`;
    button.append(title, detail);
    button.addEventListener('click', () => selectDocument(item, true, true));
    list.append(button);
  }
  byId('count').textContent = `${visible.length} ${visible.length === 1 ? 'document': 'documents'}${archive.checked ? ' · including previous editions': ' · previous editions hidden'}`;
  byId('empty').hidden = visible.length > 0;
  // The reader retains the chosen PDF while the list is narrowed.
}

async function initialize() {
  try {
    const response = await fetch('library.json');
    if (!response.ok) throw new Error('Catalogue unavailable');
    const catalogue = await response.json();
    documents = catalogue.documents;
    // Only catalogue IDs and packaged PDF paths can reach the viewer; query strings never become URLs.
    if (!documents.length || !documents.every(item => /^[a-z0-9-]+$/.test(item.id) && /^files\/[A-Za-z0-9.-]+\.pdf$/.test(item.pdf) && /^docs\/[A-Za-z0-9/._-]+\.pdf$/.test(item.source) && !item.source.includes('..'))) throw new Error('Invalid catalogue');
    for (const name of [...new Set(documents.map(item => item.category))]) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      category.append(option);
    }
    const requested = new URLSearchParams(location.search).get('doc');
    const item = documents.find(entry => entry.id === requested) || documents[0];
    archive.checked = Boolean(item.archived);
    selectDocument(item, false);
    filterDocuments();
    search.addEventListener('input', filterDocuments);
    category.addEventListener('change', filterDocuments);
    archive.addEventListener('change', filterDocuments);
  } catch {
    byId('count').textContent = 'Documentation unavailable';
    byId('error').hidden = false;
  }
}
initialize();
