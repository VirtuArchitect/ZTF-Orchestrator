#!/usr/bin/env bash
# Distributed at the root of the checksummed host-service kit.
set -euo pipefail
[[ "$(id -u)" = 0 ]] || { echo 'Run as root.' >&2; exit 1; }
[[ "${1:-}" = --maintenance-confirmed ]] || { echo 'Confirm that all jobs, pipelines, installations and recovery activity are idle, then use --maintenance-confirmed.' >&2; exit 1; }
KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP=/opt/ztf-orchestrator
[[ -f "$KIT/SHA256SUMS" && -f "$KIT/bundle.json" && -f "$APP/.env" && -f "$APP/appliance/docker-compose.appliance.yml" ]] || { echo 'Extract the complete host-service kit on the existing appliance first.' >&2; exit 1; }
(cd "$KIT" && sha256sum -c SHA256SUMS)
if systemctl cat ztf-update-service >/dev/null 2>&1; then
  systemctl stop ztf-update-service
fi
python3 - <<'PY'
import json
from pathlib import Path
state = Path('/var/lib/ztf-update-service/private/state.json')
pending = Path('/var/lib/ztf-update-service/requests/request.json')
if pending.exists():
    raise SystemExit('A pending request must be reconciled before bootstrap. The existing host service remains stopped.')
if state.exists():
    data = json.loads(state.read_text())
    operation = data.get('operation') or {}
    if data.get('maintenance') or (operation and operation.get('status') not in {'succeeded', 'failed', 'interrupted', 'rejected'}):
        raise SystemExit('An existing host-service operation requires reconciliation before bootstrap. The existing service remains stopped.')
PY
BACKUP="$APP/update-artifacts/host-service-bootstrap-$(date -u +%Y%m%d%H%M%S)-$$"
install -d -m 0700 "$BACKUP"
cp -p "$APP/.env" "$BACKUP/environment.before"
cp -p "$APP/appliance/docker-compose.appliance.yml" "$BACKUP/compose.before"
chmod 0600 "$BACKUP/environment.before" "$BACKUP/compose.before"
for relative in appliance/update_service.py appliance/scripts/install-update-service.sh appliance/scripts/apply-update-request.sh appliance/systemd/ztf-update-service.service; do
  install -d -m 0755 "$(dirname "$APP/$relative")"
  if [[ -e "$APP/$relative" ]]; then
    install -d -m 0700 "$BACKUP/$(dirname "$relative")"
    cp -p "$APP/$relative" "$BACKUP/$relative"
  fi
  install -o root -g root -m 0644 "$KIT/$relative" "$APP/$relative"
done
ZTF_UPDATE_SERVICE_START=0 bash "$APP/appliance/scripts/install-update-service.sh"
UPDATE_GID="$(getent group ztf-updates | cut -d: -f3)"
python3 "$KIT/configure-update-service.py" --group-id "$UPDATE_GID"
systemctl start ztf-update-service
echo "Host kit installed. Root-only configuration backup: $BACKUP"
echo 'No application/container restart has occurred. Apply the matching application image using the bundled bootstrap instructions.'
