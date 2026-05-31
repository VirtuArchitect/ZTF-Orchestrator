# nginx Reverse Proxy with TLS

This guide configures nginx as a TLS-terminating reverse proxy in front of
ZTF-Orchestrator, enabling HTTPS access on port 443 and securing Server-Sent
Events (SSE) streams. Suitable for team server deployments on a trusted
internal network.

---

## Prerequisites

- nginx 1.18+ installed on the same host or a dedicated proxy
- A TLS certificate (self-signed or from your internal CA / Let's Encrypt)
- ZTF-Orchestrator running on `127.0.0.1:5001` (default)

---

## Generate a Self-Signed Certificate (internal / lab use)

```bash
sudo mkdir -p /etc/nginx/certs
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:4096 \
  -keyout /etc/nginx/certs/ztf.key \
  -out    /etc/nginx/certs/ztf.crt \
  -subj   "/CN=ztf-orchestrator.internal"
sudo chmod 600 /etc/nginx/certs/ztf.key
```

For production, replace with a certificate issued by your internal PKI or
Let's Encrypt (`certbot --nginx`).

---

## nginx Site Configuration

Create `/etc/nginx/sites-available/ztf-orchestrator`:

```nginx
# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name ztf-orchestrator.internal;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name ztf-orchestrator.internal;

    # ── TLS ──────────────────────────────────────────────────────────────────
    ssl_certificate     /etc/nginx/certs/ztf.crt;
    ssl_certificate_key /etc/nginx/certs/ztf.key;

    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # ── Security headers ─────────────────────────────────────────────────────
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options           DENY                                  always;
    add_header X-Content-Type-Options    nosniff                               always;
    add_header Referrer-Policy           strict-origin-when-cross-origin       always;

    # ── Rate limiting (defence-in-depth — Flask-Limiter also limits) ─────────
    limit_req_zone $binary_remote_addr zone=ztf_login:10m rate=10r/m;
    limit_req_zone $binary_remote_addr zone=ztf_api:10m   rate=60r/m;

    # ── Proxy to Flask ────────────────────────────────────────────────────────
    location / {
        proxy_pass         http://127.0.0.1:5001;
        proxy_http_version 1.1;

        # Required for SSE — disable buffering
        proxy_buffering            off;
        proxy_cache                off;
        proxy_read_timeout         3600s;   # match ZTF_EXEC_TIMEOUT
        proxy_send_timeout         3600s;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ── Login endpoint — stricter rate limit ──────────────────────────────────
    location /api/auth/login {
        limit_req zone=ztf_login burst=5 nodelay;
        proxy_pass http://127.0.0.1:5001;
        proxy_set_header Host            $host;
        proxy_set_header X-Real-IP       $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # ── SSE execution streams — no buffering, long timeout ───────────────────
    location ~ ^/api/(execute|install|pipelines/.*/run) {
        proxy_pass             http://127.0.0.1:5001;
        proxy_http_version     1.1;
        proxy_buffering        off;
        proxy_cache            off;
        proxy_read_timeout     3700s;
        proxy_set_header Host  $host;
        proxy_set_header X-Real-IP $remote_addr;

        # Flush SSE chunks immediately
        add_header             X-Accel-Buffering no;
    }
}
```

Enable the site and reload nginx:

```bash
sudo ln -s /etc/nginx/sites-available/ztf-orchestrator \
           /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## UFW Firewall (Ubuntu / Debian)

```bash
sudo ufw allow 443/tcp comment "ZTF-Orchestrator HTTPS"
sudo ufw deny  5001/tcp comment "Block direct Flask access"
sudo ufw reload
```

---

## Vite Dev Server (development only)

If running `npm run dev`, update `vite.config.ts` to proxy through the same
origin so CORS headers remain consistent:

```typescript
server: {
  proxy: {
    '/api': { target: 'https://localhost', secure: false },
    '/health': { target: 'https://localhost', secure: false },
  }
}
```

---

## BSI IT-Grundschutz Alignment

| BSI Control | Implementation |
|---|---|
| APP.3.2.A2 — TLS | TLS 1.2+ enforced; TLS 1.0/1.1 disabled |
| APP.3.2.A4 — HTTP headers | HSTS, X-Frame-Options, X-Content-Type-Options |
| APP.3.2.A8 — Rate limiting | nginx + Flask-Limiter defence-in-depth |
| NET.1.1.A5 — Network segmentation | Flask bound to 127.0.0.1; nginx is the only public listener |
| SYS.1.3.A5 — Minimal services | Port 5001 blocked at firewall; only 443 exposed |
