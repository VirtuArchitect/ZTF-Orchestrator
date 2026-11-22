"""Ensure the published guide, source provenance and Pages media stay in sync."""
import hashlib
import json
import re
import base64
import zlib
from zipfile import ZipFile
from xml.etree import ElementTree
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]


def historical_recording(recording):
    """Earlier audits prove their own snapshot, not a later narrated revision."""
    return recording.get('baselineVerification', recording)


def test_public_entry_pages_link_the_current_manual_downloads():
    folder = ROOT / 'docs/manuals'
    manifest = json.loads((folder / 'administrator-user-guide-publication.json').read_text(encoding='utf-8'))
    expected = {kind: row['url'] for kind, row in manifest['currentDownloads']['files'].items()}

    class ManualLinks(HTMLParser):
        def __init__(self):
            super().__init__()
            self.links = {}

        def handle_starttag(self, tag, attrs):
            attributes = dict(attrs)
            if tag == 'a' and attributes.get('id', '').startswith('admin-guide-'):
                self.links[attributes['id'].removeprefix('admin-guide-')] = attributes.get('href')

    for name in ['docs/pages/project/index.html', 'public/tutorials/index.html']:
        parser = ManualLinks()
        parser.feed((ROOT / name).read_text(encoding='utf-8'))
        assert parser.links == expected
    readme = (ROOT / 'README.md').read_text(encoding='utf-8')
    links = re.findall(r'\[[^\]]*\]\(([^)]+)\)', readme)
    assert set(expected.values()) <= set(links)


def test_manual_original_release_provenance_and_current_downloads():
    folder = ROOT / 'docs/manuals'
    manifest = json.loads((folder / 'administrator-user-guide-publication.json').read_text(encoding='utf-8'))
    release = manifest['releaseDownloads']
    prefix = 'https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/' + release['releaseTag'] + '/'
    assert release['releaseTag'] == 'v1.8.5-rc1'
    assert re.fullmatch(r'[a-f0-9]{40}', release['sourceRevision'])
    expected_sums = {}
    assert set(release['files']) == {'pdf', 'word'}
    for row in release['files'].values():
        assert Path(row['source']).name == row['source']
        assert Path(row['asset']).name == row['asset']
        assert row['asset'] == row['source'].rsplit('.', 1)[0] + '-' + release['published'] + '.' + row['source'].rsplit('.', 1)[1]
        assert row['url'] == prefix + row['asset']
        assert row['sha256'] == manifest['addressAnonymisation']['originalFiles'][row['source']]
        expected_sums[row['asset']] = row['sha256']
    for row in manifest['currentDownloads']['files'].values():
        data = (folder / row['source']).read_bytes()
        assert len(data) == row['bytes']
        assert hashlib.sha256(data).hexdigest() == row['sha256'] == manifest['files'][row['source']]
        assert row['url'] in (folder / 'README.md').read_text(encoding='utf-8')
    checksums = release['checksums']
    assert Path(checksums['asset']).name == checksums['asset']
    assert checksums['url'] == prefix + checksums['asset']
    payload = (folder / checksums['asset']).read_bytes()
    assert len(payload) == checksums['bytes']
    assert hashlib.sha256(payload).hexdigest() == checksums['sha256']
    actual_sums = {name: digest for digest, name in
                   (line.split('  ', 1) for line in payload.decode('ascii').splitlines())}
    assert actual_sums == expected_sums


def test_current_guide_release_assets_are_exact_verified_repository_copies():
    folder = ROOT / 'docs/manuals'
    manifest = json.loads((folder / 'administrator-user-guide-publication.json').read_text(encoding='utf-8'))
    release = manifest['currentReleaseDownloads']
    assert release['published'] == '2026-11-22'
    assert re.fullmatch(r'[a-f0-9]{40}', release['sourceRevision'])
    prefix = 'https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/' + release['releaseTag'] + '/'
    expected = {}
    for kind, row in release['files'].items():
        source = folder / row['source']
        assert source.name == row['source']
        assert row['asset'] == source.stem + '-' + release['published'] + source.suffix
        assert row['url'] == prefix + row['asset'] == manifest['currentDownloads']['files'][kind]['url']
        assert row['sha256'] == manifest['files'][source.name] == hashlib.sha256(source.read_bytes()).hexdigest()
        assert row['bytes'] == source.stat().st_size
        assert manifest['repositoryDownloads']['files'][kind]['sha256'] == row['sha256']
        assert manifest['repositoryDownloads']['files'][kind]['url'] != row['url']
        expected[row['asset']] = row['sha256']
    checksum = release['checksums']
    assert checksum['url'] == prefix + checksum['asset']
    payload = (folder / checksum['asset']).read_bytes()
    assert len(payload) == checksum['bytes']
    assert hashlib.sha256(payload).hexdigest() == checksum['sha256']
    assert {name: digest for digest, name in
            (line.split('  ', 1) for line in payload.decode('ascii').splitlines())} == expected
    assert checksum['url'] in (folder / 'README.md').read_text(encoding='utf-8')
    assert manifest['releaseDownloads']['published'] == '2026-11-19'


def test_complete_video_zip_release_links_match_the_current_media_snapshot():
    download = json.loads((ROOT / 'docs/user-guide-video-download.json').read_text(encoding='utf-8'))
    media = ROOT / 'docs/assets/user-guide-videos'
    manifest = json.loads((media / 'series-manifest.json').read_text(encoding='utf-8'))
    assert download['kind'] == 'documentation-media'
    assert download['parts'] == manifest['parts'] == 23
    assert download['chapters'] == manifest['chapters']
    assert Path(download['asset']).name == download['asset'] and download['asset'].endswith('.zip')
    assert download['url'] == (
        'https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/'
        + download['releaseTag'] + '/' + download['asset']
    )
    assert download['checksumUrl'] == download['url'] + '.sha256'
    assert re.fullmatch(r'[a-f0-9]{64}', download['sha256'])
    assert download['bytes'] > 0 and download['offlinePlayer']
    assert hashlib.sha256((media / 'SHA256SUMS').read_bytes()).hexdigest() == download['mediaChecksumsSha256']

    class DownloadLinks(HTMLParser):
        def __init__(self):
            super().__init__()
            self.links = {}

        def handle_starttag(self, tag, attrs):
            attributes = dict(attrs)
            if tag == 'a' and attributes.get('id', '').startswith('series-zip-'):
                self.links[attributes['id']] = attributes.get('href')

    for filename in ['public/tutorials/index.html', 'docs/pages/project/index.html']:
        parser = DownloadLinks()
        parser.feed((ROOT / filename).read_text(encoding='utf-8'))
        assert parser.links == {'series-zip-download': download['url'], 'series-zip-checksum': download['checksumUrl']}
    for filename in ['README.md', 'docs/user-guide-videos.md']:
        targets = re.findall(r'\[[^\]]*\]\(([^)]+)\)', (ROOT / filename).read_text(encoding='utf-8'))
        assert download['url'] in targets and download['checksumUrl'] in targets


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
    manifest = json.loads((media / 'series-manifest.json').read_text(encoding='utf-8'))
    assert report['remainingVideosChecked'] == 22 and report['controlPart'] == 2
    assert report['repairedParts'] == [0, 1] + list(range(3, 16)) + list(range(18, 23))
    assert report['unchangedParts'] == [2, 16, 17]
    assert report['samplesChecked'] == report['captionCueSamples'] + report['speechGapSamples'] == 926
    assert report['failedSamples'] == 0 and report['narrationRegenerated'] is False
    assert [r['part'] for r in report['records']] == list(range(23))
    for record in report['records']:
        baseline = historical_recording(manifest['verification'][record['part']])
        assert baseline['sha256'] == record['sha256']
        assert record['failedSamples'] == 0
        if record['changed']:
            assert record['beforeSha256'] != record.get('captionAuditSha256', record['sha256'])
            assert record['audioUnchanged'] and record['chaptersUnchanged']
            assert len(record['audioPayloadSha256']) == len(record['decodedAudioSha256']) == 64
        else:
            # This verdict describes the earlier caption-only audit. Later
            # picture corrections retain its snapshot and update the file hash.
            assert record['beforeSha256'] == record.get('captionAuditSha256', record['sha256'])
        assert len(record['browserSamples']) == 2
        for sample in record['browserSamples']:
            x, y, width, height = sample['region']
            assert 0 <= x < x + width <= 1920 and 0 <= y < y + height <= 1080
            mask = zlib.decompress(base64.b64decode(sample['referenceMaskZlib']))
            assert len(mask) == width * height and set(mask) <= {0, 1}


def test_visual_topic_audit_preserves_all_audio_captions_and_chapter_links():
    media = ROOT / 'docs/assets/user-guide-videos'
    report = json.loads((media / 'visual-topic-audit.json').read_text(encoding='utf-8'))
    manifest = json.loads((media / 'series-manifest.json').read_text(encoding='utf-8'))
    expected = sorted(set(range(manifest['parts'])) - {6})
    assert report['reviewedParts'] == report['correctedParts'] == expected
    assert [row['part'] for row in report['records']] == expected
    assert report['lightMode'] and not report['narrationRegenerated'] and not report['liveActionsExecuted']
    assert report['captionSamplesChecked'] == sum(row['captionSamples'] for row in report['records']) == 891
    assert report['failedCaptionSamples'] == 0
    assert report['chaptersReviewed'] == sum(row['chaptersReviewed'] for row in report['records']) == 115
    assert report['visualStatesReviewed'] == sum(row['visualStatesReviewed'] for row in report['records']) == 434
    assert report['findingsAddressed'] == sum(len(row['issues']) for row in report['records'])
    control = historical_recording(manifest['verification'][report['controlPart']])
    assert control['sha256'] == report['controlSha256']
    for row in report['records']:
        current = manifest['verification'][row['part']]
        recording = historical_recording(current)
        assert row['sha256'] == recording['sha256'] != row['beforeSha256']
        assert recording.get('posterSha256', hashlib.sha256((media / row['poster']).read_bytes()).hexdigest()) == row['posterSha256']
        assert row['audioUnchanged'] and row['chaptersUnchanged'] and row['fullDecode'] == 'passed'
        assert row['audioPayloadSha256'] == recording['audioPayloadSha256']
        assert row['decodedAudioSha256'] == recording['decodedAudioSha256']
        assert len(row['audioPacketTimingSha256']) == len(row['chapterMetadataSha256']) == 64
        assert row['failedCaptionSamples'] == 0 and row['issues']
        assert all(issue['status'] == 'corrected' for issue in row['issues'])
        assert len(row['companionSha256']) == 4
        for name, expected_hash in row['companionSha256'].items():
            assert Path(name).name == name
            assert recording.get('companionSha256', {}).get(name, hashlib.sha256((media / name).read_bytes()).hexdigest()) == expected_hash
    page = (ROOT / 'public/tutorials/index.html').read_text(encoding='utf-8')
    assert 'media/Update-verification.json' in page


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
    assert manifest['chapters'] == sum(len(entry['chapters']) for entry in catalogue)
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
    assert manifest['updatedParts'] == list(range(23))
    assert not any(entry['retained'] for entry in manifest['verification'])
    assert '23-part series' in page and '22 November 2026' in page
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
    text = ''.join(root.itertext())
    statement = ('Operators report consistent successful cluster deployments with pipeline '
                 'post-configuration and successful cluster recoveries using ZTF Orchestrator.')
    assert statement in text
    assert manifest['operationalExperienceUpdate']['statement'] == statement
    assert not re.search(r'40\+|20\+', text)
    assert 'Workload restoration remains a backup-platform handoff.' in text
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



def test_manual_links_every_corrected_tutorial_and_complete_download():
    folder = ROOT / 'docs/manuals'
    download = json.loads((ROOT / 'docs/user-guide-video-download.json').read_text(encoding='utf-8'))
    with ZipFile(folder / 'ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1.docx') as archive:
        document = ElementTree.fromstring(archive.read('word/document.xml'))
        relationships = ElementTree.fromstring(archive.read('word/_rels/document.xml.rels'))
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    relationship_id = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
    used_ids = {link.get(relationship_id) for link in document.findall('.//w:hyperlink', ns)}
    targets = {row.get('Target') for row in relationships
               if row.get('Id') in used_ids and row.get('TargetMode') == 'External'
               and row.get('Type', '').endswith('/hyperlink')}
    expected = {f'https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part={part:02d}'
                for part in range(download['parts'])}
    expected.update([download['url'], download['checksumUrl']])
    assert len(expected) == 25 and expected <= targets
    text = ''.join(document.itertext())
    assert 'predates the Sessions panel' not in text
    assert 'complete revised video ZIP' in text
    assert download['previousEdition']['url'] not in targets


def test_manual_distinguishes_foundation_workflows_without_reformatting():
    folder = ROOT / 'docs/manuals'
    manifest = json.loads((folder / 'administrator-user-guide-publication.json').read_text(encoding='utf-8'))
    with ZipFile(folder / 'ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1.docx') as archive:
        document = ElementTree.fromstring(archive.read('word/document.xml'))
    text = ''.join(document.itertext())
    for phrase in ['Cluster Create (Foundation VM)', 'Foundation Central associated with Prism Central',
                   'Cluster Create (Standalone FCA)', 'separate Foundation Central Appliance',
                   'local/remote site or an approved rebuild', 'Match the YAML to that service.',
                   'validate inventory read-only']:
        assert phrase in text
    verification = manifest['formatVerification']
    assert verification['pixelComparedPages'] == verification['pages'] == manifest['pdfPages'] == 156
    assert verification['pixelChangedPages'] == verification['wordExportChangedPages'] == [14, 47, 77, 80]
    assert verification['unchangedPublishedPages'] == 152
    assert verification['tables'] == manifest['tables'] == 54
    assert verification['inlineImages'] == manifest['inlineImages'] == 83
    assert verification['pageGeometryUnchanged'] and verification['stylesImagesHeadersFootersUnchanged']
    assert verification['changedDocxParts'] == ['word/document.xml', 'word/_rels/document.xml.rels']


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


def test_revised_introductions_preserve_task_narration_and_shift_chapters():
    media = ROOT / 'docs/assets/user-guide-videos'
    manifest = json.loads((media / 'series-manifest.json').read_text(encoding='utf-8'))
    statement = ('Operators report consistent successful cluster deployments with pipeline '
                 'post-configuration and successful cluster recoveries using ZTF Orchestrator.')
    update = manifest['operationalExperienceUpdate']
    assert update['statement'] == statement
    assert update['newSpeechRequests'] == 1
    assert manifest['chapters'] == 125
    assert update['newJoannaNarrationParts'] == [0, 2, 3, 4, 15]
    for part in update['newJoannaNarrationParts']:
        row = manifest['verification'][part]
        base = row['baselineVerification']
        assert row['sourceAudioPreservedAsExactAacSuffix']
        assert [c['title'] for c in row['chapters'][1:]] == [c['title'] for c in base['chapters']]
        assert all(abs(a['start'] - b['start'] - row['introSeconds']) < .001
                   for a, b in zip(row['chapters'][1:], base['chapters']))
        stem = Path(row['file']).stem
        text = (media / (stem + '-transcript.txt')).read_text(encoding='utf-8')
        intro, original = text.split('\n\n', 1)
        assert intro == statement
        assert hashlib.sha256(original.encode()).hexdigest() == base['companionSha256'][stem + '-transcript.txt']
        vtt = (media / (stem + '.vtt')).read_text(encoding='utf-8')
        assert vtt.startswith('WEBVTT') and 'Operators report consistent' in vtt
        assert not re.search(r'40\+|20\+|more than forty|more than twenty', text, re.I)
    for name in ['README.md', 'docs/pages/project/index.html', 'public/tutorials/index.html']:
        assert statement in (ROOT / name).read_text(encoding='utf-8')
