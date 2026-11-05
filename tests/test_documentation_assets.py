"""Keep published screenshot provenance and manual download hashes verifiable."""
import hashlib
import json
import re
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[1]

@pytest.mark.parametrize("relative", [
    "docs/assets/guide/v1.8.5-rc1",
    "docs/assets/recovery-profile-management",
    "docs/assets/pe-health-reporting",
    "docs/assets/readme/v1.8.5-rc1",
    "docs/assets/disaster-recovery/setup-v1.8.5-rc1",
])
def test_published_asset_checksums(relative):
    folder = ROOT / relative
    for line in (folder / "SHA256SUMS").read_text(encoding="utf-8").splitlines():
        digest, name = line.split("  ", 1)
        path = (folder / name).resolve()
        assert path.is_relative_to(ROOT.resolve())
        assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, name

@pytest.mark.parametrize("kind", ["guide", "readme"])
def test_screenshot_manifest_matches_gallery(kind):
    folder = ROOT / "docs/assets" / kind / "v1.8.5-rc1"
    manifest = json.loads((folder / "capture-manifest.json").read_text(encoding="utf-8"))
    assert manifest["simulated"] is True
    assert {entry["file"] for entry in manifest["screens"]} == {p.name for p in folder.glob("*.png")}
    for entry in manifest["screens"]:
        assert hashlib.sha256((folder / entry["file"]).read_bytes()).hexdigest() == entry["sha256"]

def test_manual_index_download_hashes():
    folder = ROOT / "docs/manuals"
    index = (folder / "README.md").read_text(encoding="utf-8")
    for label, extension in [("PDF", "pdf"), ("Editable source", "docx")]:
        match = re.search(re.escape(label) + r" SHA256: `([a-f0-9]{64})`", index)
        assert match
        path = folder / f"ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1.{extension}"
        assert hashlib.sha256(path.read_bytes()).hexdigest() == match.group(1)
