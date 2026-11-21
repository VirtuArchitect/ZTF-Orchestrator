"""Verify the public PDF catalogue and the actual Pages packaging path."""
import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / 'public/documentation/library.json'


def test_library_packages_exact_source_pdfs(tmp_path):
    subprocess.run(['node', str(ROOT / 'scripts/build-documentation-library.mjs'), str(tmp_path)], check=True)
    catalogue = json.loads((tmp_path / 'library.json').read_text(encoding='utf-8'))
    assert len(catalogue['documents']) == 10
    assert len({item['id'] for item in catalogue['documents']}) == 10
    checksums = (tmp_path / 'SHA256SUMS.txt').read_text()
    for item in catalogue['documents']:
        original = (ROOT / item['source']).read_bytes()
        published = (tmp_path / item['pdf']).read_bytes()
        assert published == original
        assert original.startswith(b'%PDF-')
        assert hashlib.sha256(published).hexdigest() == item['sha256']
        assert len(published) == item['bytes']
        assert f"{item['sha256']}  {item['pdf']}" in checksums
        assert (tmp_path / 'covers' / f"{item['id']}.jpg").is_file()
    assert (tmp_path / 'index.html').is_file()
    assert (tmp_path / 'library.js').is_file()
    assert (tmp_path / 'library.css').is_file()


def test_library_keeps_branded_editions_and_review_boundaries():
    catalogue = json.loads(CATALOGUE.read_text())
    branding = json.loads((ROOT / 'docs/manuals/workflow-script-quick-guides-branding.json').read_text())
    current = [item for item in catalogue['documents'] if not item['archived']]
    for edition in branding['editions']:
        item = next(item for item in current if item['source'].endswith(edition['pdf']))
        assert item['pages'] == edition['pages']
        assert '79c3ecc' in item['scope']
    recovery = next(item for item in current if item['id'] == 'disaster-recovery-setup')
    assert 'Build-specific' in recovery['edition']
    assert 'a3c9c79' in recovery['scope']
    assert len(current) == 7


def test_pages_navigation_and_pdf_packaging_are_connected():
    workflow = (ROOT / '.github/workflows/pages-demo.yml').read_text()
    assert 'dist-demo/demo/documentation dist-demo/' in workflow
    assert 'node scripts/build-documentation-library.mjs dist-demo/documentation' in workflow
    for path, link in [('public/tutorials/index.html', '../documentation/'),
                       ('docs/pages/project/index.html', './documentation/')]:
        assert f'href="{link}"' in (ROOT / path).read_text(encoding='utf-8')
