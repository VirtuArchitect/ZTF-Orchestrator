"""Ensure the published guide, source provenance and Pages media stay in sync."""
import hashlib
import json
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
    assert '139-page' in index and '2 November 2026' in index
