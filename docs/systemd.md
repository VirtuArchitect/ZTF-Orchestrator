# systemd Service Unit

This guide configures ZTF-Orchestrator as a systemd service so it starts
automatically on boot, restarts on failure, and runs under a dedicated
unprivileged service account.

---

## Prerequisites

- A Linux host with systemd (Ubuntu 20.04+, RHEL 8+, Debian 11+)
- ZTF-Orchestrator cloned to `/opt/ztf/ZTF-Orchestrator`
- ZeroTouch Framework cloned to `/opt/ztf/zerotouch-framework`
- Python virtual environment at `/opt/ztf/venv`
- A dedicated service account `ztf-svc` (created below)

---

## Step 1 — Create the Service Account

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin ztf-svc
sudo mkdir -p /opt/ztf /var/lib/ztf-ui
sudo chown -R ztf-svc:ztf-svc /opt/ztf /var/lib/ztf-ui
```

If you cloned the repositories as root, fix ownership:

```bash
sudo chown -R ztf-svc:ztf-svc /opt/ztf/ZTF-Orchestrator \
                                /opt/ztf/zerotouch-framework \
                                /opt/ztf/venv
```

---

## Step 2 — Install the Unit File

Create `/etc/systemd/system/ztf-orchestrator.service`:

```ini
[Unit]
Description=ZeroTouch Enterprise Orchestrator
Documentation=https://github.com/VirtuArchitect/ZTF-Orchestrator
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ztf-svc
Group=ztf-svc
WorkingDirectory=/opt/ztf/ZTF-Orchestrator

# ── Environment ───────────────────────────────────────────────────────────────
Environment=ZTF_DATA_DIR=/var/lib/ztf-ui
Environment=ZTF_PATH=/opt/ztf/zerotouch-framework
Environment=ZTF_PYTHON=/opt/ztf/venv/bin/python3
Environment=ZTF_PORT=5001
Environment=ZTF_EXEC_TIMEOUT=3600
Environment=ZTF_LOG_LEVEL=INFO
# Optional: load from an environment file for secrets
# EnvironmentFile=/etc/ztf-orchestrator/env

# ── Process ───────────────────────────────────────────────────────────────────
ExecStart=/opt/ztf/venv/bin/python3 server.py
Restart=on-failure
RestartSec=10
TimeoutStartSec=60
TimeoutStopSec=30

# ── Security hardening ────────────────────────────────────────────────────────
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/ztf-ui /opt/ztf/zerotouch-framework/config
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
MemoryDenyWriteExecute=true
LockPersonality=true
CapabilityBoundingSet=
AmbientCapabilities=

# ── Resource limits ───────────────────────────────────────────────────────────
LimitNOFILE=65536
MemoryMax=512M
CPUQuota=80%

# ── Logging ───────────────────────────────────────────────────────────────────
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ztf-orchestrator

[Install]
WantedBy=multi-user.target
```

---

## Step 3 — Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable ztf-orchestrator
sudo systemctl start  ztf-orchestrator
```

Check status:

```bash
sudo systemctl status ztf-orchestrator
```

Stream logs:

```bash
sudo journalctl -u ztf-orchestrator -f
```

Retrieve the first-run admin password:

```bash
sudo journalctl -u ztf-orchestrator --no-pager | grep "default admin"
```

---

## Step 4 — Environment File (optional, for secrets)

Create `/etc/ztf-orchestrator/env` (mode 0600, owned by `ztf-svc`):

```bash
sudo mkdir -p /etc/ztf-orchestrator
sudo tee /etc/ztf-orchestrator/env > /dev/null <<'EOF'
ZTF_DATA_DIR=/var/lib/ztf-ui
ZTF_PATH=/opt/ztf/zerotouch-framework
ZTF_TOKEN_TTL=28800
EOF
sudo chmod 600 /etc/ztf-orchestrator/env
sudo chown ztf-svc:ztf-svc /etc/ztf-orchestrator/env
```

Uncomment `EnvironmentFile=` in the unit file, then reload:

```bash
sudo systemctl daemon-reload
sudo systemctl restart ztf-orchestrator
```

---

## Updating ZTF-Orchestrator

```bash
cd /opt/ztf/ZTF-Orchestrator
sudo -u ztf-svc git pull --ff-only
sudo -u ztf-svc /opt/ztf/venv/bin/pip install -q -r requirements.txt
sudo systemctl restart ztf-orchestrator
```

---

## BSI IT-Grundschutz Alignment

| BSI Control | Implementation |
|---|---|
| SYS.1.3.A1 — Least privilege | `User=ztf-svc`, `CapabilityBoundingSet=` (no capabilities) |
| SYS.1.3.A3 — Minimal processes | `PrivateDevices=true`, `RestrictNamespaces=true` |
| SYS.1.3.A5 — Minimal services | `ProtectSystem=strict`, read-write only to data dirs |
| SYS.1.3.A6 — Auto-restart | `Restart=on-failure`, `RestartSec=10` |
| SYS.1.3.A15 — Mandatory Access | `NoNewPrivileges=true`, `LockPersonality=true` |
| OPS.1.1.2.A9 — Resource limits | `MemoryMax=512M`, `CPUQuota=80%`, `LimitNOFILE=65536` |
| OPS.1.1.5 — Logging | Structured JSON to journald via `SyslogIdentifier` |
