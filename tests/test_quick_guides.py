"""Keep the operator guide index complete as the UI catalogue changes."""
import json
import hashlib
import re
import struct
import zipfile
from pathlib import Path
from urllib.parse import unquote
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
GUIDES = ROOT / 'docs' / 'quick-guides'


def _catalog_blocks():
    source = (ROOT / 'src' / 'data.ts').read_text(encoding='utf-8')
    workflows = source.split('export const WORKFLOWS:', 1)[1].split('export const SCRIPT_CATEGORIES', 1)[0]
    scripts = source.split('export const SCRIPTS:', 1)[1].split('export const ZTF2_SCRIPT_CATEGORIES', 1)[0]
    retired_scripts = source.split('export const ZTF2_SCRIPTS:', 1)[1].split('export const ', 1)[0]
    workflow_objects = re.findall(r'\{\s*id:.*?\n  \}', workflows, re.S)
    assert workflow_objects, 'Workflow catalogue parser returned no entries'
    current, retired = set(), set()
    for item in workflow_objects:
        ident = re.search(r"id: '([^']+)'", item).group(1)
        (retired if "runtimeMode: 'ztf2'" in item else current).add(ident)
    ids = lambda block: set(re.findall(r"\bid: '([^']+)'", block))
    assert ids(scripts) and ids(retired_scripts)
    return current, retired, ids(scripts), ids(retired_scripts)


def test_quick_guides_cover_every_catalogue_entry():
    current, retired, scripts, retired_scripts = _catalog_blocks()
    manifest = json.loads((GUIDES / 'coverage.json').read_text(encoding='utf-8'))
    rows = manifest['guides']
    assert len({row['path'] for row in rows}) == len(rows)
    assert {row['id'] for row in rows if row['kind'] == 'workflows'} == current
    assert {row['id'] for row in rows if row['kind'] == 'scripts'} == scripts
    assert {row['id'] for row in rows if row['kind'] == 'retired'} == (
        {'workflow-' + ident for ident in retired} | {'script-' + ident for ident in retired_scripts}
    )
    assert manifest['counts'] == {
        'currentWorkflows': len(current), 'scripts': len(scripts),
        'dedicatedOperations': sum(row['kind'] == 'operations' for row in rows),
        'retiredReferences': len(retired) + len(retired_scripts),
    }
    index = (GUIDES / 'README.md').read_text(encoding='utf-8')
    for row in rows:
        assert f"]({row['path']})" in index
        text = (GUIDES / row['path']).read_text(encoding='utf-8')
        for heading in ['Purpose', 'Prerequisites', 'Required inputs', 'Procedure',
                        'Validation and expected result', 'Failure and recovery',
                        'Evidence to capture', 'References']:
            assert re.search(rf'## {heading}\n\n\S', text), (row['path'], heading)
        if row['kind'] == 'retired':
            assert 'Retired console entry' in text
            assert 'Do not re-enable retired routes' in text


def test_quick_guide_local_links_resolve():
    for file in GUIDES.rglob('*.md'):
        for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', file.read_text(encoding='utf-8')):
            if re.match(r'^[a-z]+:', target) or target.startswith('#'):
                continue
            destination = (file.parent / unquote(target.split('#')[0])).resolve()
            assert destination.is_relative_to(ROOT), (file, target)
            assert destination.exists(), (file, target)


def test_plain_vlan_example_omits_incomplete_ipam():
    import yaml

    text = (GUIDES / 'scripts' / 'CreateSubnetPe.md').read_text(encoding='utf-8')
    sample = yaml.safe_load(re.search(r'```yaml\n(.*?)```', text, re.S).group(1))
    network = sample['clusters']['192.0.2.10']['networks'][0]
    assert network == {'name': 'APP_VLAN_120', 'subnet_type': 'VLAN', 'vlan_id': 120}
    assert 'no `ip_config` block' in text
    assert 'dhcp_options' in text


def test_screenshots_match_all_current_guides():
    coverage = json.loads((GUIDES / 'coverage.json').read_text(encoding='utf-8'))
    assets = ROOT / coverage['screenshotDirectory']
    capture = json.loads((assets / 'capture-manifest.json').read_text(encoding='utf-8'))
    expected = {(g['kind'], g['id']): g for g in coverage['guides'] if g['kind'] != 'retired'}
    actual = {(s['kind'], s['id']): s for s in capture['captures']}
    assert len(actual) == len(capture['captures'])
    assert set(actual) == set(expected)
    assert capture['sourceCommit'] == coverage.get('screenshotSourceCommit', coverage['sourceCommit'])
    assert 'external network blocked' in capture['mode']
    hashes = set()
    for key, shot in actual.items():
        assert shot['simulated'] is True
        data = (assets / shot['file']).read_bytes()
        assert data[:8] == b'\x89PNG\r\n\x1a\n'
        assert struct.unpack('>II', data[16:24]) == (shot['width'], shot['height'])
        digest = hashlib.sha256(data).hexdigest()
        assert digest == shot['sha256']
        hashes.add(digest)
        text = (GUIDES / expected[key]['path']).read_text(encoding='utf-8')
        assert shot['file'] in text and 'not evidence of a successful run' in text
        assert f"captured 21 November 2026 from application source `{capture['sourceCommit'][:7]}`" in text


def test_previous_illustrated_word_preserves_original_screenshots():
    capture = json.loads((ROOT / 'docs/assets/quick-guides/2026-11-20/capture-manifest.json').read_text())
    hashes = {shot['sha256'] for shot in capture['captures']}
    illustrated = ROOT / 'docs/manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Illustrated.docx'
    with zipfile.ZipFile(illustrated) as book:
        embedded = {hashlib.sha256(book.read(name)).hexdigest()
                    for name in book.namelist() if name.startswith('word/media/')}
    assert hashes <= embedded, 'A task screenshot is missing from the illustrated Word collection'


def test_screenshot_download_contains_only_current_anonymised_assets():
    folder = ROOT / 'docs/assets/quick-guides/2026-11-20'
    manifest = json.loads((folder / 'capture-manifest.json').read_text(encoding='utf-8'))
    assert manifest['addressAnonymisation'] == '2026-11-22'
    archive = ROOT / 'docs/manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Screenshots.zip'
    with zipfile.ZipFile(archive) as package:
        members = {Path(name).name: name for name in package.namelist()}
        for row in manifest['captures']:
            assert package.read(members[row['file']]) == (folder / row['file']).read_bytes()
        for filename in ['capture-manifest.json', 'SHA256SUMS']:
            assert package.read(members[filename]) == (folder / filename).read_bytes()


def test_corrected_editions_retain_the_standard_cover_and_format():
    manuals = ROOT / 'docs/manuals'
    manifest = json.loads((manuals / 'workflow-script-quick-guides-branding.json').read_text(encoding='utf-8'))
    cover_hash = hashlib.sha256((ROOT / manifest['coverAsset']).read_bytes()).hexdigest()
    assert cover_hash == manifest['coverImageSha256']
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    w = '{' + ns['w'] + '}'
    for original in manifest['preservedFiles']:
        assert hashlib.sha256((manuals / original['filename']).read_bytes()).hexdigest() == original['sha256']
    for edition in manifest['editions']:
        path = manuals / edition['docx']
        with zipfile.ZipFile(path) as book:
            document = ET.fromstring(book.read('word/document.xml'))
            sections = document.findall('.//w:sectPr', ns)
            assert len(sections) == 2, edition['name']
            assert sections[0].find('w:titlePg', ns) is not None
            for section in sections:
                size = section.find('w:pgSz', ns)
                assert (size.get(w + 'w'), size.get(w + 'h')) == ('12240', '15840')
            margins = sections[1].find('w:pgMar', ns)
            for key, value in {'left': '980', 'right': '1020', 'top': '1400',
                               'bottom': '1000', 'header': '840', 'footer': '600'}.items():
                assert margins.get(w + key) == value, (edition['name'], key)
            media = {hashlib.sha256(book.read(name)).hexdigest()
                     for name in book.namelist() if name.startswith('word/media/')}
            assert cover_hash in media, 'Standard cover artwork is missing'
            if edition['name'] != 'Text':
                captures = json.loads((ROOT / 'docs/assets/quick-guides/2026-11-20/capture-manifest.json').read_text(encoding='utf-8'))
                assert {shot['sha256'] for shot in captures['captures']} <= media
            furniture = ''.join(book.read(name).decode('utf-8') for name in book.namelist()
                                if re.fullmatch(r'word/(header|footer)\d+\.xml', name))
            assert 'Team Operational Quick Guides' in furniture
            assert 'v1.8.5-rc1 | Source 79c3ecc | November 2026 | Page ' in furniture
            styles = ET.fromstring(book.read('word/styles.xml'))
            default = styles.find('w:docDefaults/w:rPrDefault/w:rPr/w:sz', ns)
            for ident, expected in {'Normal': '22', 'Title': '40', 'Heading1': '40', 'Heading2': '30'}.items():
                style = styles.find(f"w:style[@w:styleId='{ident}']", ns)
                size = style.find('w:rPr/w:sz', ns)
                assert (size if size is not None else default).get(w + 'val') == expected
            # A fixed text-line height can silently crop inline screenshots.
            for paragraph in document.findall('.//w:p', ns):
                if paragraph.find('.//{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}inline') is not None:
                    spacing = paragraph.find('w:pPr/w:spacing', ns)
                    assert spacing is not None and spacing.get(w + 'lineRule') == 'auto'
