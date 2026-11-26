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


def test_dated_video_audio_is_not_relabelled_as_a_new_recording():
    review = json.loads((EVIDENCE / 'Video-currency-review.json').read_text(encoding='utf-8'))
    assert len(review['coreParts']) == 23
    assert review['narrationReplaced'] is False
    assert {row['part'] for row in review['coreParts']
            if row['status'] == 'narration-correction-required'} == {5, 18, 19, 20, 21}
    player = (ROOT / 'public/tutorials/index.html').read_text(encoding='utf-8')
    assert 'Parts 05 and 18–21 contain older PE TLS/live-write defaults' in player
    for folder in ['user-guide-videos', 'deployment-progress-video']:
        media = ROOT / 'docs/assets' / folder
        for line in (media / 'SHA256SUMS').read_text(encoding='utf-8').splitlines():
            digest, name = line.split('  ', 1)
            assert hashlib.sha256((media / name).read_bytes()).hexdigest() == digest
