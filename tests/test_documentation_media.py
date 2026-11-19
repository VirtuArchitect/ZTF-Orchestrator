"""Ensure the published guide, source provenance and Pages media stay in sync."""
import hashlib
import json
import re
import base64
import zlib
from zipfile import ZipFile
from xml.etree import ElementTree
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_part06_visuals_follow_appliance_updates_and_preserve_narration():
    media = ROOT / 'docs/assets/user-guide-videos'
    report = json.loads((media / 'part06-visual-correction.json').read_text(encoding='utf-8'))
    manifest = json.loads((media / 'series-manifest.json').read_text(encoding='utf-8'))
    recording = next(row for row in manifest['verification'] if row['part'] == 6)
    assert report['sha256'] == recording['sha256']
    assert report['beforeSha256'] != report['sha256']
    assert report['route'] == '/appliance' and report['tab'] == 'Updates'
    assert report['allApiRequestsIntercepted'] and not report['liveActionsExecuted']
    assert not report['narrationChanged'] and report['audioUnchanged'] and report['chaptersUnchanged']
    assert report['chapters'] == recording['chapters']
    assert report['audioPayloadSha256'] == recording['audioPayloadSha256']
    assert report['decodedAudioSha256'] == recording['decodedAudioSha256']
    assert report['captionSamples'] == 35 and report['failedCaptionSamples'] == 0
    scenes = report['visualTimeline']
    assert {scene['chapter'] for scene in scenes} == set(range(5))
    assert {'updates-start', 'storage-review', 'readiness', 'exact-approval',
            'install-progress', 'verified-complete', 'rollback'} <= {scene['source'] for scene in scenes}
    assert not {'setup', 'jobs'} & {scene['source'] for scene in scenes}
    assert [scene['start'] for scene in scenes] == sorted(scene['start'] for scene in scenes)
    assert 'database/data restore is a separate procedure' in report['rollbackScope']


def test_caption_render_audit_covers_every_video_and_preserves_audio():
    media = ROOT / 'docs/assets/user-guide-videos'
    report = json.loads((media / 'caption-render-audit.json').read_text(encoding='utf-8'))
    assert report['remainingVideosChecked'] == 22 and report['controlPart'] == 2
    assert report['repairedParts'] == [0, 1] + list(range(3, 16)) + list(range(18, 23))
    assert report['unchangedParts'] == [2, 16, 17]
    assert report['samplesChecked'] == report['captionCueSamples'] + report['speechGapSamples'] == 926
    assert report['failedSamples'] == 0 and report['narrationRegenerated'] is False
    assert [r['part'] for r in report['records']] == list(range(23))
    for record in report['records']:
        assert hashlib.sha256((media / record['file']).read_bytes()).hexdigest() == record['sha256']
        assert record['failedSamples'] == 0
        if record['changed']:
            assert record['beforeSha256'] != record['sha256']
            assert record['audioUnchanged'] and record['chaptersUnchanged']
            assert len(record['audioPayloadSha256']) == len(record['decodedAudioSha256']) == 64
        else:
            assert record['beforeSha256'] == record['sha256']
        assert len(record['browserSamples']) == 2
        for sample in record['browserSamples']:
            x, y, width, height = sample['region']
            assert 0 <= x < x + width <= 1920 and 0 <= y < y + height <= 1080
            mask = zlib.decompress(base64.b64decode(sample['referenceMaskZlib']))
            assert len(mask) == width * height and set(mask) <= {0, 1}


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
    assert all('videoUrl' not in entry for entry in catalogue)
    assert 'cp "$source"/* "$output/"' in workflow
    assert manifest['parts'] == 23
    assert manifest['lightMode'] is True
    assert manifest['updatedParts'] == list(range(16)) + list(range(18, 23))
    assert [entry['part'] for entry in manifest['verification'] if entry['retained']] == [16, 17]
    assert '23-part series' in page and '19 November 2026' in page
    assert 'Shared Validation Evidence and Historical Records' in page
    assert 'Supported Execution and Retired Integrations' in page
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


def test_part_02_compares_all_create_cluster_workflows():
    page = (ROOT / 'public/tutorials/index.html').read_text(encoding='utf-8')
    catalogue, _ = json.JSONDecoder().raw_decode(page.split('const videos=', 1)[1])
    part = catalogue[2]
    assert part['title'] == 'Create Cluster Workflows and Deployment Use Cases'
    titles = {chapter['title'] for chapter in part['chapters']}
    assert {'Use a classic Foundation VM', 'Use Foundation Central',
            'Use a standalone FCA', 'Validate the selected path'} <= titles
    assert part['file'] == 'ZTF-Orchestrator-User-Guide-Part-02-Deploy-a-Cluster-with-Foundation-VM.mp4'
    transcript = (ROOT / 'docs/assets/user-guide-videos' /
                  part['file'].replace('.mp4', '-transcript.txt')).read_text(encoding='utf-8')
    for text in ['Foundation Central associated with Prism Central',
                 'separate Foundation Central Appliance', 'matching YAML schema',
                 'Site Deploy', 'Imaging Only']:
        assert text in transcript
    for filename in ['docs/start-here.md', 'docs/user-guide-videos.md']:
        guide = (ROOT / filename).read_text(encoding='utf-8')
        assert all(name in guide for name in ['Cluster Create (Foundation VM)',
                   'Cluster Create (Standalone FCA)', 'Foundation Central associated with Prism Central'])
