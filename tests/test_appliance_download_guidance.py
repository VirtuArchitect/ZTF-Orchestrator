"""Keep published appliance links tied to verified full-disk evidence."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/assets/appliance-build-72'


def test_build72_downloads_reference_verified_disks_not_metadata_artifacts():
    evidence = json.loads((EVIDENCE / 'Build-72-Verification.json').read_text(encoding='utf-8'))
    assert evidence['buildNumber'] == 72
    assert evidence['httpChecksPassed'] == 36
    assert evidence['deploymentJobsCreated'] == 0
    assert evidence['liveClusterChanges'] is False
    assert evidence['ahvImportPerformed'] is False
    surfaces = ['README.md', 'docs/pages/project/index.html', 'docs/appliance-build-72.md']
    sums = (EVIDENCE / 'SHA256SUMS-f9eee7e.txt').read_text(encoding='utf-8')
    assert {row['profile'] for row in evidence['profiles']} == {'standard', 'airgap', 'minimal'}
    for row in evidence['profiles']:
        assert row['sourceCommit'] == 'f9eee7e5b7c15610b4f463818bda364c907e4fd3'
        assert row['firstBootPassed'] and row['defaultEnabled'] and row['noJobsCreated']
        assert row['sha256'] in sums
        assert str(row['artifactId']) in row['downloadUrl']
        for surface in surfaces:
            assert row['downloadUrl'] in (ROOT / surface).read_text(encoding='utf-8')


def test_approved_video_refresh_has_new_audio_and_preserves_other_recordings():
    review = json.loads((EVIDENCE / 'Video-currency-review.json').read_text(encoding='utf-8'))
    assert len(review['coreParts']) == 23
    assert review['narrationReplaced'] is True
    assert review['narrationReplacedParts'] == [5, 18, 19, 20, 21]
    assert review['previousReview']['narrationReplaced'] is False
    media = ROOT / 'docs/assets/user-guide-videos'
    report = json.loads((media / 'Narration-refresh-verification.json').read_text(encoding='utf-8'))
    assert report['newSpeechRequests'] == 5
    assert report['captionSamples'] == 149 and report['failedCaptionSamples'] == 0
    assert len(report['preservedParts']) == 18
    assert report['listeningReview'] == 'not_performed'
    for row in report['records']:
        assert row['fullDecode'] == 'passed' and row['speed'] == 1
        assert row['audioChannels'] == 2 and row['audioSampleRate'] == 48000
        assert row['sha256'] != row['beforeSha256']
        assert row['heldImageCaptionChanges'] > 10
        assert len(row['browserSamples']) == 2
        assert hashlib.sha256((media / row['file']).read_bytes()).hexdigest() == row['sha256']
        text = (media / (Path(row['file']).stem + '-transcript.txt')).read_text(encoding='utf-8').strip()
        assert hashlib.sha256(text.encode('utf-8')).hexdigest() == row['approvedTextSha256']
    for row in report['preservedParts']:
        assert hashlib.sha256((media / row['file']).read_bytes()).hexdigest() == row['sha256']
        for name, digest in row['companions'].items():
            assert hashlib.sha256((media / name).read_bytes()).hexdigest() == digest
    for folder in ['user-guide-videos', 'deployment-progress-video']:
        media_folder = ROOT / 'docs/assets' / folder
        for line in (media_folder / 'SHA256SUMS').read_text(encoding='utf-8').splitlines():
            digest, name = line.split('  ', 1)
            assert hashlib.sha256((media_folder / name).read_bytes()).hexdigest() == digest
