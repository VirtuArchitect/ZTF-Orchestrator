"""Ensure the published guide, source provenance and Pages media stay in sync."""
import hashlib
import json
import re
from zipfile import ZipFile
from xml.etree import ElementTree
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_training_media_integrity_and_pages_packaging():
    media = ROOT / 'docs/assets/user-guide-videos'
    files = set()
    for line in (media / 'SHA256SUMS').read_text(encoding='utf-8').splitlines():
        digest, name = line.split('  ', 1)
        assert Path(name).name == name
        assert hashlib.sha256((media / name).read_bytes()).hexdigest() == digest, name
        files.add(name)
    assert files == {p.name for p in media.iterdir() if p.is_file() and p.name != 'SHA256SUMS'}
    manifest = json.loads((media / 'series-manifest.json').read_text(encoding='utf-8'))
    assert manifest['liveActionsExecuted'] is False
    page = (ROOT / 'public/tutorials/index.html').read_text(encoding='utf-8')
    assert 'ZTF-Orchestrator Overview' in page and 'media/' in page
    catalogue, _ = json.JSONDecoder().raw_decode(page.split('const videos=', 1)[1])
    assert len(catalogue) == len(manifest['verification']) == manifest['parts']
    assert [entry['part'] for entry in catalogue] == list(range(manifest['parts']))
    assert {entry['file'] for entry in catalogue} == {path.name for path in media.glob('*.mp4')}
    for entry, recording in zip(catalogue, manifest['verification']):
        assert entry['part'] == recording['part']
        assert entry['file'] == recording['file']
        assert hashlib.sha256((media / entry['file']).read_bytes()).hexdigest() == recording['sha256']
        starts = [chapter['at'] for chapter in entry['chapters']]
        assert starts == sorted(set(starts)) and starts[0] == 0 and starts[-1] < recording['duration']
        if recording['updated']:
            assert starts == [chapter['start'] for chapter in recording['chapters']]
        stem = Path(entry['file']).stem
        assert all(stem + suffix in files for suffix in (
            '-poster.jpg', '-chapters.txt', '-transcript.txt', '.vtt', '.srt',
        ))
    workflow = (ROOT / '.github/workflows/pages-demo.yml').read_text(encoding='utf-8')
    external = [entry for entry in catalogue if 'videoUrl' in entry]
    assert [entry['part'] for entry in external] == [15]
    part = external[0]
    assert re.fullmatch(
        r'https://raw\.githubusercontent\.com/VirtuArchitect/ZTF-Orchestrator/'
        r'[a-f0-9]{40}/docs/assets/user-guide-videos/' + re.escape(part['file']),
        part['videoUrl'],
    )
    assert f"PART_15_MP4={part['file']}" in workflow
    assert 'sha256sum -c SHA256SUMS' in workflow
    assert 'demo-build.json' in workflow
    assert 'docs' in (ROOT / '.dockerignore').read_text(encoding='utf-8').splitlines()


def test_published_manual_checksums_match_current_reference():
    folder = ROOT / 'docs/manuals'
    index = (folder / 'README.md').read_text(encoding='utf-8')
    manifest = json.loads((folder / 'administrator-user-guide-publication.json').read_text(encoding='utf-8'))
    for suffix in ['pdf', 'docx']:
        path = folder / f'ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1.{suffix}'
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        assert digest == manifest['files'][path.name]
        assert digest in index
    assert f"{manifest['pdfPages']}-page" in index
    assert manifest['reviewedDisplay'] in index
    assert manifest['simulatedScreenshots'] is True
    assert manifest['liveActionsExecuted'] is False
    assert len(manifest['applicationSource']) == len(manifest['repositoryReview']) == 40
    path = folder / 'ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1.docx'
    with ZipFile(path) as archive:
        root = ElementTree.fromstring(archive.read('word/document.xml'))
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
          'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'}
    assert len(root.findall('.//w:tbl', ns)) == manifest['tables']
    assert len(root.findall('.//wp:inline', ns)) == manifest['inlineImages']
    geometry = []
    def attr(element, key):
        return int(element.attrib['{' + ns['w'] + '}' + key]) * 635
    for section in root.findall('.//w:sectPr', ns):
        size = section.find('w:pgSz', ns)
        margin = section.find('w:pgMar', ns)
        geometry.append([attr(size, 'w'), attr(size, 'h')] +
                        [attr(margin, edge) for edge in ['top', 'bottom', 'left', 'right']])
    assert geometry == manifest['sectionGeometryEmu']



def test_current_operator_documentation_local_link_targets_exist():
    """Check local file/image targets; external URLs and fragments are out of scope."""
    documents = (
        'README.md', 'CHANGELOG.md', 'release-notes-v1.8.5-rc1.txt',
        'docs/session-management.md', 'docs/admin-guide.md', 'docs/user-guide.md',
        'docs/postgresql-backend.md', 'docs/start-here.md',
        'docs/user-guide-videos.md', 'docs/manuals/README.md',
    )
    missing = []
    checked = 0
    for name in documents:
        document = ROOT / name
        content = document.read_text(encoding='utf-8')
        for target in re.findall(r'!?\[[^\]]*\]\(([^)]+)\)', content):
            if re.match(r'[a-zA-Z]+:|#', target):
                continue
            target = target.split('#')[0].split('?')[0]
            if not target:
                continue
            checked += 1
            if not (document.parent / target).exists():
                missing.append(f'{name}: {target}')
    assert checked > 0, 'No local documentation links were checked'
    assert not missing, 'Missing documentation targets:\n' + '\n'.join(missing)
