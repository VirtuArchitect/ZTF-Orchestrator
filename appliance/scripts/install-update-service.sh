#!/usr/bin/env bash
# One-time trusted host installation; does not restart the application.
set -euo pipefail
[[ "$(id -u)" = 0 ]] || { echo 'Run as root.' >&2; exit 1; }
APP_DIR="${ZTF_APPLIANCE_DIR:-/opt/ztf-orchestrator}"
[[ "$APP_DIR" = /opt/ztf-orchestrator ]] || { echo 'Custom layouts require explicit service configuration.' >&2; exit 1; }
install -d -m 0700 /var/lib/ztf-update-service /var/lib/ztf-update-service/private /var/lib/ztf-update-service/requests /var/lib/ztf-update-service/results
getent group ztf-updates >/dev/null || groupadd --system ztf-updates
UPDATE_GID="$(getent group ztf-updates | cut -d: -f3)"
chgrp ztf-updates /var/lib/ztf-update-service/requests /var/lib/ztf-update-service/results
chmod 2770 /var/lib/ztf-update-service/requests
chmod 2750 /var/lib/ztf-update-service/results
if grep -q '^ZTF_UPDATE_SERVICE_GID=' "$APP_DIR/.env"; then
  sed -i "s/^ZTF_UPDATE_SERVICE_GID=.*/ZTF_UPDATE_SERVICE_GID=${UPDATE_GID}/" "$APP_DIR/.env"
else
  printf '\nZTF_UPDATE_SERVICE_GID=%s\n' "$UPDATE_GID" >> "$APP_DIR/.env"
fi
install -d -m 0755 /usr/local/lib/ztf-update-service
install -o root -g root -m 0644 "$APP_DIR/appliance/update_service.py" /usr/local/lib/ztf-update-service/update_service.py
if [[ ! -e /etc/ztf-update-service.json ]]; then
  printf '%s\n' '{"appDir":"/opt/ztf-orchestrator","controlDir":"/var/lib/ztf-update-service"}' > /etc/ztf-update-service.json
  chmod 0600 /etc/ztf-update-service.json
fi
install -o root -g root -m 0644 "$APP_DIR/appliance/systemd/ztf-update-service.service" /etc/systemd/system/ztf-update-service.service
systemctl daemon-reload
if [[ "${ZTF_UPDATE_SERVICE_START:-1}" = 1 ]]; then
  systemctl enable --now ztf-update-service
else
  systemctl enable ztf-update-service
fi
echo 'Update service installed. Apply the reviewed appliance Compose mounts at the next application cutover.'
