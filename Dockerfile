FROM python:3.11-slim

LABEL maintainer="John Goulden"
LABEL application="ZTF-Orchestrator"

ARG ZTF_REPO_URL=https://github.com/nutanixdev/zerotouch-framework.git
ARG ZTF_REF=main

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV ZTF_DATA_DIR=/var/lib/ztf-orchestrator
ENV ZTF_PATH=/opt/zerotouch-framework
ENV ZTF_PORT=5001

# ============================================================================
# Install system packages
# ============================================================================

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        git \
        curl \
        ca-certificates && \
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
# Install orchestrator requirements only
# ============================================================================

COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ============================================================================
# Clone ZTF repository only
# Do NOT install upstream requirements
# ============================================================================

RUN git clone --depth 1 --branch "${ZTF_REF}" \
    "${ZTF_REPO_URL}" \
    /opt/zerotouch-framework && \
    rm -rf /opt/zerotouch-framework/.git

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
