# Guided update host-service kit — {{VERSION}}

Application image: `ghcr.io/virtuarchitect/ztf-orchestrator:{{VERSION}}`.
Source revision: `{{SOURCE_REF}}`.

This kit is separate from the Docker image. Importing the ZIP does not execute
the host installer. Existing appliances require this one-time bootstrap; routine
supported updates can then be requested under **Appliance Ops → Updates**.

## First update on an existing Linux appliance

1. Verify the ZIP SHA-256 against its independently supplied checksum. Obtain
   both through the approved release/transfer process. Embedded checksums alone
   do not authenticate the publisher.
2. Finish or reconcile all jobs, pipelines, framework installations and recovery
   runs. Retain a recoverable VM/database/data backup and the running image.
   Confirm enough disk space for extraction, backup and image loading. No cluster
   deployment or post-configuration pipeline should be started during cutover.
3. Extract the complete trusted ZIP into a root-controlled directory. Replace
   `/path/to/` with the actual transfer location:

   ```bash
   BUNDLE=/opt/ztf-orchestrator/update-artifacts/bootstrap-{{VERSION}}
   sudo install -d -m 0700 "$BUNDLE"
   sudo python3 -m zipfile -e /path/to/ztf-update-{{VERSION}}.zip "$BUNDLE"
   sudo sh -c 'cd "$1" && sha256sum -c SHA256SUMS' sh "$BUNDLE"
   ```

4. Review the scripts, service and guide, then install the host kit:

   ```bash
   sudo bash "$BUNDLE/host-service/bootstrap-guided-updates.sh" --maintenance-confirmed
   sudo systemctl status ztf-update-service --no-pager
   ```

   The bootstrap checks kit hashes, allocates the update-service group, retains
   root-only copies of existing `.env`, Compose and helper files, installs the
   service, and prepares Compose without restarting the application. It preserves
   resolved ports, named volumes, TLS mounts, networks and other services. Only
   the update spool mounts/group and image/build-identity settings are adjusted.
   Resolved Compose contains secrets and is stored with root-only permissions.
   A pending/interrupted host operation blocks bootstrap for reconciliation.

5. Apply this matching application image using the retained CLI entry point:

   ```bash
   sudo env \
     ZTF_UPDATE_REQUEST_FILE="$BUNDLE/manifest.json" \
     ZTF_UPDATE_IMAGE_TAR="$BUNDLE/images/{{IMAGE_FILENAME}}" \
     bash /opt/ztf-orchestrator/appliance/scripts/apply-update-request.sh
   ```

   Pre-update backups remain mandatory. The bundled CLI helper excludes imported
   update caches and preload bundles from the data archive; keep their original
   packages/sources separately. This initial CLI transition follows the existing
   appliance service restart procedure. Later guided updates recreate only the
   application and use the host worker's quiescent, verified backup process.

6. Confirm the actual running image, database and application:

   ```bash
   sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
   curl -fsS http://127.0.0.1:5001/health
   sudo systemctl is-active ztf-update-service
   ```

   Expect the image/version `{{VERSION}}`, healthy application/PostgreSQL and
   an active update service. Sign in, open **Appliance Ops → Updates**, select
   **Review Storage Before Upload**, and review its non-mutating report. Check
   existing pipelines, recovery profiles and certificate trust before resuming work.
   No Foundation imaging, password rotation or cluster workflow is needed to verify
   this appliance update.

## Recovery

The bootstrap prints a root-only backup directory named
`/opt/ztf-orchestrator/update-artifacts/host-service-bootstrap-*`. Retain its
`environment.before`, `compose.before` and prior helper files, plus the matching
database/data backup pair and previous image. Use the approved appliance rollback
procedure; image rollback and database restoration are separate operations.

If bootstrap fails before application cutover, inspect the printed backup and
the host-service state before retrying. An existing service may deliberately be
left stopped when a pending/interrupted operation is detected. Do not replay an
installation or delete its private state to clear the warning.

For future guided updates, progress survives application restart. GUI image rollback
requires independent database compatibility confirmation. If the application cannot
serve the console, use the host/VM recovery path. This kit does not provide a separate
recovery web server and is not a QCOW2 appliance image.

Full procedure and UAT boundaries:
https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/{{SOURCE_REF}}/docs/guided-appliance-updates.md
