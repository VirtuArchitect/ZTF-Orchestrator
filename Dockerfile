FROM python:3.11-slim

# Create non-root service user
RUN useradd -r -s /bin/false -d /var/lib/ztf-orchestrator ztf-svc && \
    mkdir -p /var/lib/ztf-orchestrator /var/log/ztf-orchestrator && \
    chown ztf-svc: /var/lib/ztf-orchestrator /var/log/ztf-orchestrator

WORKDIR /app

# Install Python dependencies (as root, before switching user)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY server.py .
COPY dist/     ./dist/
COPY static/   ./static/

# Drop privileges
USER ztf-svc

# Environment defaults (override at runtime)
ENV ZTF_DATA_DIR=/var/lib/ztf-orchestrator \
    ZTF_PORT=5001 \
    ZTF_LOG_LEVEL=INFO \
    ZTF_EXEC_TIMEOUT=3600 \
    ZTF_TOKEN_TTL=28800

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5001/health')"

CMD ["python", "server.py"]
