"""Verify source coverage, preservation and the actual Pages packaging path."""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / 'public/documentation/library.json'


def load(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))


@pytest.mark.skipif(shutil.which('node') is None, reason='PDF packaging runs in the Node CI job; Node is unavailable here')
def test_library_packages_exact_source_pdfs(tmp_path):
    subprocess.run(['node', str(ROOT / 'scripts/build-documentation-library.mjs'), str(tmp_path)], check=True)
    catalogue = json.loads((tmp_path / 'library.json').read_text(encoding='utf-8'))
    assert catalogue == load('public/documentation/library.json')
    assert len({item['id'] for item in catalogue['documents']}) == len(catalogue['documents'])
    checksums = (tmp_path / 'SHA256SUMS.txt').read_text()
    for item in catalogue['documents']:
        original = (ROOT / item['source']).read_bytes()
        published = (tmp_path / item['pdf']).read_bytes()
        assert published == original
        assert original.startswith(b'%PDF-')
        assert hashlib.sha256(published).hexdigest() == item['sha256']
        assert len(published) == item['bytes']
        assert f"{item['sha256']}  {item['pdf']}" in checksums
        assert (tmp_path / 'covers' / item.get('coverFile', item['id'] + '.jpg')).is_file()
    for name in ['index.html', 'library.js', 'library.css', 'collection-register.json']:
        assert (tmp_path / name).is_file()


def test_collection_covers_selected_sources_and_current_tasks():
    catalogue = load('public/documentation/library.json')
    documents = {item['id']: item for item in catalogue['documents']}
    current = [item for item in documents.values() if not item['archived']]
    assert catalogue['currentDocuments'] == len(current)
    assert catalogue['historicalDocuments'] == len(documents) - len(current)
    assert catalogue['documents'][0]['id'] == 'collection-overview'
    plan = load('docs/manuals/current/collection-plan.json')
    for item in plan['items']:
        published = documents[item['id']]
        assert published['sourceDocument'] == item['sourceDocument']
        assert published['archived'] == item['archived']
        assert published['applicationSource'] == plan['applicationSource']
        assert any(source['path'] == item['sourceDocument'] for source in published['inputSources'])
    coverage = load('docs/quick-guides/coverage.json')
    tasks = {item['sourceDocument'] for item in current if item.get('kind') == 'task'}
    expected = {'docs/quick-guides/' + item['path'] for item in coverage['guides'] if item['kind'] != 'retired'}
    assert tasks == expected
    book = documents['current-workflow-script-collection']
    assert book['taskCount'] == len(tasks)
    contents = load('docs/manuals/current/current-task-book-contents.json')
    assert {row['id'] for row in contents} == {item['id'] for item in current if item.get('kind') == 'task'}
    assert all(1 < row['contentsPage'] < row['page'] <= book['pages'] for row in contents)


def test_register_has_dispositions_and_matches_catalogue():
    catalogue = load('public/documentation/library.json')
    register = load('docs/manuals/current/collection-register.json')
    inventory = {item['path']: item for item in register['inventory']}
    assert len(inventory) == len(register['inventory'])
    assert all(item['reason'] and item['disposition'] not in {'needs-review', 'publication-review-pending'} for item in inventory.values())
    assert {path.relative_to(ROOT).as_posix() for path in (ROOT / 'docs').rglob('*.md')} <= inventory.keys()
    assert {item['id']: item['sha256'] for item in register['documents']} == {item['id']: item['sha256'] for item in catalogue['documents']}
    for key in ['applicationSource', 'currentDocuments', 'historicalDocuments']:
        assert register[key] == catalogue[key]


def test_earlier_branded_editions_are_preserved_and_historical():
    catalogue = load('public/documentation/library.json')
    branding = load('docs/manuals/workflow-script-quick-guides-branding.json')
    for edition in branding['editions']:
        item = next(item for item in catalogue['documents'] if item['source'].endswith(edition['pdf']))
        assert item['archived'] is True
        assert item['pages'] == edition['pages']
        assert '79c3ecc' in item['scope']
    previous = next(item for item in catalogue['documents'] if item['id'] == 'disaster-recovery-setup-previous-edition')
    assert previous['archived'] is True
    assert 'a3c9c79' in previous['scope']
    assert 'retired' in (ROOT / 'docs/admin-guide.md').read_text().lower()


def test_pages_navigation_and_pdf_packaging_are_connected():
    workflow = (ROOT / '.github/workflows/pages-demo.yml').read_text()
    assert 'dist-demo/demo/documentation dist-demo/' in workflow
    assert 'node scripts/build-documentation-library.mjs dist-demo/documentation' in workflow
    ci = (ROOT / '.github/workflows/ci.yml').read_text()
    assert 'node scripts/build-documentation-library.mjs "$RUNNER_TEMP/documentation-library"' in ci
    for path, link in [('public/tutorials/index.html', '../documentation/'),
                       ('docs/pages/project/index.html', './documentation/')]:
        assert f'href="{link}"' in (ROOT / path).read_text(encoding='utf-8')
