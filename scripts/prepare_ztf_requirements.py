from pathlib import Path
import re


ztf = Path("/opt/zerotouch-framework")
candidates = [
    ztf / "requirements" / "prod.txt",
    ztf / "requirements" / "requirements.txt",
    ztf / "requirements.txt",
]
req = next((path for path in candidates if path.exists()), None)
if req is None:
    req_dir = ztf / "requirements"
    req = next(iter(sorted(req_dir.glob("*.txt"))), None) if req_dir.is_dir() else None
if req is None:
    raise SystemExit("Could not locate ZeroTouch Framework requirements")

text = req.read_text()
calm_lines = []


def local_wheel(match: re.Match[str]) -> str:
    wheel = ztf / "calm-whl" / Path(match.group(1)).name
    return f"@ file://{wheel}" if wheel.exists() else match.group(0)


text = re.sub(r"@ file://(\S+\.whl)", local_wheel, text)
text = re.sub(
    r"^(calm-dsl\s+@ file://\S+\.whl).*$",
    lambda match: calm_lines.append(match.group(1))
    or "# calm-dsl installed separately without optional deps",
    text,
    flags=re.MULTILINE,
)
Path("/tmp/ztf-requirements.txt").write_text(text)
Path("/tmp/ztf-calm-requirements.txt").write_text("\n".join(calm_lines) + "\n")
print(f"Using ZeroTouch Framework requirements: {req}")
