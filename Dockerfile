FROM python:3.11-slim

# ── System packages ────────────────────────────────────────────────────────────
# git: needed to clone ZTF during build
RUN apt-get update && \
    apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

# ── Non-root service user ─────────────────────────────────────────────────────
RUN useradd -r -s /bin/false -d /var/lib/ztf-orchestrator ztf-svc && \
    mkdir -p /var/lib/ztf-orchestrator /var/log/ztf-orchestrator /opt/zerotouch-framework && \
    chown ztf-svc: /var/lib/ztf-orchestrator /var/log/ztf-orchestrator

WORKDIR /app

# ── ZTF-Orchestrator Python dependencies ─────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── ZeroTouch Framework ───────────────────────────────────────────────────────
# Clone ZTF and install its dependencies so the image is self-contained.
# Override ZTF_REPO_URL at build time to use an internal mirror:
#   docker build --build-arg ZTF_REPO_URL=https://gitea.internal/ztf.git .
ARG ZTF_REPO_URL=https://github.com/nutanixdev/zerotouch-framework.git
ARG ZTF_REF=main

RUN git clone --depth 1 --branch "${ZTF_REF}" "${ZTF_REPO_URL}" /opt/zerotouch-framework && \
    # Discover and install the requirements file using the same logic as the server
    if [ -f /opt/zerotouch-framework/requirements/prod.txt ]; then \
        pip install --no-cache-dir -r /opt/zerotouch-framework/requirements/prod.txt; \
    elif ls /opt/zerotouch-framework/requirements/*.txt 1>/dev/null 2>&1; then \
        pip install --no-cache-dir -r $(ls /opt/zerotouch-framework/requirements/*.txt | head -1); \
    elif [ -f /opt/zerotouch-framework/requirements.txt ]; then \
        pip install --no-cache-dir -r /opt/zerotouch-framework/requirements.txt; \
    fi && \
    # Install any bundled Calm DSL wheels (air-gapped Calm support)
    if [ -d /opt/zerotouch-framework/calm-whl ]; then \
        pip install --no-cache-dir --no-index \
            --find-links /opt/zerotouch-framework/calm-whl \
            -r /opt/zerotouch-framework/calm-whl/requirements.txt 2>/dev/null || true; \
    fi && \
    # Remove git history to reduce image size
    rm -rf /opt/zerotouch-framework/.git

# ── ZTF-Orchestrator application ──────────────────────────────────────────────
COPY server.py .
COPY dist/     ./dist/
COPY static/   ./static/

# Drop privileges
USER ztf-svc

# ── Environment defaults ──────────────────────────────────────────────────────
# All values can be overridden at runtime via environment variables or .env file
ENV ZTF_DATA_DIR=/var/lib/ztf-orchestrator \
    ZTF_PATH=/opt/zerotouch-framework \
    ZTF_PYTHON=python3 \
    ZTF_PORT=5001 \
    ZTF_LOG_LEVEL=INFO \
    ZTF_EXEC_TIMEOUT=3600 \
    ZTF_TOKEN_TTL=28800 \
    ZTF_CONFIG_BACKUPS=5

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5001/health')"

CMD ["python", "server.py"]
