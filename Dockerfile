FROM python:3.11-slim

LABEL maintainer="John Goulden"
LABEL application="ZTF-Orchestrator"

ARG ZTF_REPO_URL=https://github.com/nutanixdev/zerotouch-framework.git
ARG ZTF_REF=v1.5.2

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV ZTF_DATA_DIR=/var/lib/ztf-orchestrator
ENV ZTF_PATH=/opt/zerotouch-framework
ENV ZTF_NKP_PATH=/var/lib/ztf-orchestrator/nkp-zerotouch-framework
ENV ZTF_PYTHON=/opt/ztf-python/bin/python
ENV ZTF_PORT=5001

# ============================================================================
# Install system packages
# ============================================================================

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        git \
        curl \
        ca-certificates \
        build-essential \
        libssl-dev \
        postgresql-client && \
    rm -rf /var/lib/apt/lists/*

# ============================================================================
# Create service user
# ============================================================================

RUN useradd -r -s /usr/sbin/nologin -d /var/lib/ztf-orchestrator ztf-svc && \
    mkdir -p \
        /var/lib/ztf-orchestrator \
        /var/log/ztf-orchestrator \
        /opt/zerotouch-framework && \
    chown -R ztf-svc:ztf-svc \
        /var/lib/ztf-orchestrator \
        /var/log/ztf-orchestrator \
        /opt/zerotouch-framework

# ============================================================================
# Working directory
# ============================================================================

WORKDIR /app

# ============================================================================
# Clone ZTF repository and install legacy runtime requirements
# ============================================================================

RUN git clone --depth 1 --branch "${ZTF_REF}" \
    "${ZTF_REPO_URL}" \
    /opt/zerotouch-framework && \
    rm -rf /opt/zerotouch-framework/.git

# ZTF v1.5.x ships a pip-compiled requirements file with an upstream developer
# file:// path for calm-dsl. Patch that path to the bundled wheel and install
# ZTF into its own venv. Keeping ZTF isolated avoids conflicts with Flask and
# other Orchestrator runtime dependencies.
RUN python - <<'PY'
from pathlib import Path
import re

ztf = Path('/opt/zerotouch-framework')
candidates = [ztf / 'requirements' / 'prod.txt', ztf / 'requirements' / 'requirements.txt', ztf / 'requirements.txt']
req = next((path for path in candidates if path.exists()), None)
if req is None:
    req_dir = ztf / 'requirements'
    req = next(iter(sorted(req_dir.glob('*.txt'))), None) if req_dir.is_dir() else None
if req is None:
    raise SystemExit('Could not locate ZeroTouch Framework requirements')

text = req.read_text()
calm_lines = []

def local_wheel(match):
    wheel = ztf / 'calm-whl' / Path(match.group(1)).name
    return f'@ file://{wheel}' if wheel.exists() else match.group(0)

text = re.sub(r'@ file://(\S+\.whl)', local_wheel, text)
text = re.sub(
    r'^(calm-dsl\s+@ file://\S+\.whl).*$',
    lambda match: calm_lines.append(match.group(1)) or '# calm-dsl installed separately without optional deps',
    text,
    flags=re.MULTILINE,
)
Path('/tmp/ztf-requirements.txt').write_text(text)
Path('/tmp/ztf-calm-requirements.txt').write_text('\n'.join(calm_lines) + '\n')
print(f'Using ZeroTouch Framework requirements: {req}')
PY

RUN python -m venv /opt/ztf-python && \
    /opt/ztf-python/bin/pip install --no-cache-dir --upgrade pip && \
    /opt/ztf-python/bin/pip install --no-cache-dir -r /tmp/ztf-requirements.txt && \
    /opt/ztf-python/bin/pip install --no-cache-dir ntnx-iam-py-client==4.0.1 && \
    /opt/ztf-python/bin/pip install --no-cache-dir --no-deps -r /tmp/ztf-calm-requirements.txt

# ============================================================================
# Install orchestrator requirements after ZTF runtime packages
# ============================================================================

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# ============================================================================
# Copy application files
# ============================================================================

COPY . /app

# ============================================================================
# Permissions
# ============================================================================

RUN chown -R ztf-svc:ztf-svc /app

# ============================================================================
# Runtime user
# ============================================================================

USER ztf-svc

# ============================================================================
# Expose port
# ============================================================================

EXPOSE 5001

# ============================================================================
# Healthcheck
# ============================================================================

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:5001/health || exit 1

# ============================================================================
# Start application
# ============================================================================

CMD ["python", "server.py"]
