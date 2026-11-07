"""Ensure the published guide, source provenance and Pages media stay in sync."""
import hashlib
import json
import re
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
    assert len(list(media.glob('*.mp4'))) == 15
    manifest = json.loads((media / 'series-manifest.json').read_text(encoding='utf-8'))
    assert manifest['parts'] == 15 and manifest['liveActionsExecuted'] is False
    page = (ROOT / 'public/tutorials/index.html').read_text(encoding='utf-8')
    assert 'ZTF-Orchestrator Overview' in page and 'media/' in page
    catalogue = json.loads(page.split('const videos=', 1)[1].split(';const player=', 1)[0])
    assert len(catalogue) == len(manifest['verification']) == 15
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
    assert 'cp docs/assets/user-guide-videos/* dist-demo/tutorials/media/' in workflow
    assert 'demo-build.json' in workflow
    assert 'docs' in (ROOT / '.dockerignore').read_text(encoding='utf-8').splitlines()


def test_published_manual_checksums_match_current_reference():
    folder = ROOT / 'docs/manuals'
    index = (folder / 'README.md').read_text(encoding='utf-8')
    for suffix in ['pdf', 'docx']:
        path = folder / f'ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1.{suffix}'
        assert hashlib.sha256(path.read_bytes()).hexdigest() in index
    assert '147-page' in index and '2 November 2026' in index



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
