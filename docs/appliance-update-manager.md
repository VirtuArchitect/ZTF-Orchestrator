# Appliance Update Manager

The Appliance Update Manager provides a controlled update workflow for
ZTF-Orchestrator appliances. It separates release discovery and operator
approval in the web UI from host-level Docker, systemd, and framework checkout
changes.

The web application does not unpack arbitrary source archives, mutate its own
container, or overwrite framework trees directly. Instead, it records verified
update metadata and stages a host-side update request. A privileged
administrator then runs the appliance helper script on the VM.

## What It Updates

The update manager supports three target types:

| Target | What changes | Default source |
| --- | --- | --- |
| `ZTF-Orchestrator` | Appliance container image tag in the host Compose environment | `VirtuArchitect/ZTF-Orchestrator` |
| `ZeroTouch Framework` | Host-visible git checkout at the configured framework path | `nutanixdev/zerotouch-framework` |
| `NKP Framework` | Host-visible git checkout at the configured NKP framework path | `VirtuArchitect/nkp-zerotouch-framework` |

It does not automatically replace:

- the AHV QCOW2 image itself;
- framework copies baked inside an immutable container image;
- NKP binary bundles such as `nkp`;
- host operating system packages.

For a fully baked air-gapped appliance, update the source refs in the appliance
build process and publish a new QCOW2 artifact.

## Connected Update Flow

1. Open **Appliance Ops > Updates**.
2. Select the update target:

   - **ZTF-Orchestrator** for the application container.
   - **ZeroTouch Framework** for the classic ZeroTouch Framework checkout.
   - **NKP Framework** for the NKP framework checkout.

3. Confirm the repository is allowlisted. The defaults are:

   ```text
   VirtuArchitect/ZTF-Orchestrator
   nutanixdev/zerotouch-framework
   VirtuArchitect/nkp-zerotouch-framework
   ```

4. For framework targets, confirm the **Target Path** is the git checkout on
   the appliance host, for example:

   ```text
   /opt/zerotouch-framework
   /var/lib/ztf-orchestrator/nkp-zerotouch-framework
   ```

5. Select whether prereleases should be included.
6. Click **Check GitHub**.
7. Review the discovered release metadata, target, release URL, and assets.
8. Click **Verify** after confirming the release is intended for the appliance.
9. As an admin, click **Stage**.
10. SSH to the appliance VM and run:

   ```bash
   sudo /opt/ztf-orchestrator/appliance/scripts/apply-update-request.sh
   ```

11. Verify health:

   ```bash
   curl http://localhost:5001/health
   sudo systemctl status ztf-orchestrator
   ```

12. For framework targets, confirm the updated checkout:

   ```bash
   git -C /opt/zerotouch-framework status --short --branch
   git -C /var/lib/ztf-orchestrator/nkp-zerotouch-framework status --short --branch
   ```

13. Return to **Appliance Ops > Updates** and click **Mark Applied**.

## Air-Gapped Update Flow

Use this when the appliance cannot reach GitHub or GHCR.

### ZTF-Orchestrator Container

1. In a connected staging environment, download or build the target appliance
   container image.
2. If the release image is published to GHCR, pull it and save it to a tar file:

   ```bash
   docker pull ghcr.io/virtuarchitect/ztf-orchestrator:vX.Y.Z
   docker save ghcr.io/virtuarchitect/ztf-orchestrator:vX.Y.Z \
     -o ztf-orchestrator-vX.Y.Z-image.tar
   sha256sum ztf-orchestrator-vX.Y.Z-image.tar
   ```

   Confirm availability before using a GHCR tag in the manifest:

   ```bash
   docker manifest inspect ghcr.io/virtuarchitect/ztf-orchestrator:vX.Y.Z
   ```

   If the GHCR tag is not available yet, build the image locally in connected
   staging and use the local image name in the manifest:

   ```bash
   docker build -t ztf-orchestrator:vX.Y.Z .
   docker save ztf-orchestrator:vX.Y.Z -o ztf-orchestrator-vX.Y.Z-image.tar
   sha256sum ztf-orchestrator-vX.Y.Z-image.tar
   ```

3. Create an offline update manifest. Use the `containerImage` value that
   matches the image name inside the tar file:

   ```json
   {
     "target": "ztf-orchestrator",
     "version": "vX.Y.Z",
     "repository": "VirtuArchitect/ZTF-Orchestrator",
     "containerImage": "ghcr.io/virtuarchitect/ztf-orchestrator:vX.Y.Z",
     "targetPath": "",
     "sourceRef": "vX.Y.Z",
     "releaseUrl": "https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/tag/vX.Y.Z",
     "checksum": "<sha256-of-transferred-image-tar>",
     "notes": "Transferred through the approved air-gapped media process."
   }
   ```

   For a locally built image tar, use:

   ```json
   "containerImage": "ztf-orchestrator:vX.Y.Z"
   ```

4. Transfer the image tar and manifest through the approved removable-media or
   internal artifact process.
5. In **Appliance Ops > Updates**, paste the manifest under **Offline Manifest
   Import** and click **Import Manifest**.
6. Verify the transferred tar checksum on the appliance host:

   ```bash
   sha256sum /path/to/ztf-orchestrator-vX.Y.Z-image.tar
   ```

7. Click **Verify**, then **Stage**.
8. Run the update helper with the transferred image tar:

   ```bash
   sudo ZTF_UPDATE_IMAGE_TAR=/path/to/ztf-orchestrator-vX.Y.Z-image.tar \
     /opt/ztf-orchestrator/appliance/scripts/apply-update-request.sh
   ```

9. Verify `/health`, then mark the update applied in the UI.

### Offline Update Package

For enterprise air-gapped operations, package the manifest and binaries into a
single zip file. The web app imports only the artifacts referenced by
`manifest.json`, verifies each SHA-256 digest during extraction, and stages the
verified artifact path into the host update request.

Package layout:

```text
ztf-update-vX.Y.Z.zip
├── manifest.json
└── images/
    └── ztf-orchestrator-vX.Y.Z-image.tar
```

Example `manifest.json` for a ZTF-Orchestrator image package:

```json
{
  "target": "ztf-orchestrator",
  "version": "vX.Y.Z",
  "repository": "VirtuArchitect/ZTF-Orchestrator",
  "containerImage": "ghcr.io/virtuarchitect/ztf-orchestrator:vX.Y.Z",
  "sourceRef": "vX.Y.Z",
  "releaseUrl": "https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/tag/vX.Y.Z",
  "artifacts": [
    {
      "type": "container-image",
      "name": "ZTF-Orchestrator image",
      "path": "images/ztf-orchestrator-vX.Y.Z-image.tar",
      "sha256": "<sha256-of-image-tar>"
    }
  ],
  "notes": "Transferred through the approved air-gapped media process."
}
```

If the image was built locally instead of pulled from GHCR, set
`containerImage` to the local tag included in the tar, for example
`ztf-orchestrator:vX.Y.Z`.

Example `manifest.json` for a framework archive package:

```json
{
  "target": "ztf-framework",
  "version": "v1.5.2",
  "repository": "nutanixdev/zerotouch-framework",
  "targetPath": "/opt/zerotouch-framework",
  "sourceRef": "v1.5.2",
  "artifacts": [
    {
      "type": "framework-archive",
      "name": "ZeroTouch Framework source",
      "path": "framework/zerotouch-framework-v1.5.2.tar.gz",
      "sha256": "<sha256-of-framework-archive>"
    }
  ]
}
```

Import process:

1. Build the zip package in connected staging.
2. Verify and record the SHA-256 digest for every artifact listed in
   `manifest.json`.
3. Transfer the zip through the approved air-gapped media process.
4. In **Appliance Ops > Updates**, select the zip under **Offline Update
   Package** and click **Import Package**.
5. Review the imported artifact paths and checksums, click **Verify**, then as
   an admin click **Stage**.
6. Run the helper without additional artifact environment variables:

   ```bash
   sudo /opt/ztf-orchestrator/appliance/scripts/apply-update-request.sh
   ```

The package upload limit defaults to 2 GiB and can be changed with
`ZTF_UPDATE_PACKAGE_MAX_UPLOAD`.

### Validated AHV Appliance v1.5.0 to v1.5.2/v1.5.3 Flow

Use this process for an AHV VM appliance built by the GitHub **AHV Build
Image** workflow and deployed in an air-gapped environment. This path was
validated on a v1.5.0 appliance using the PostgreSQL storage backend, then
hardened in v1.5.3 with mandatory pre-update state backups.

In that configuration, **Appliance Ops > Updates** can show the staged request
path as `/var/lib/ztf-orchestrator/appliance_update_request.json`, but the
request may be stored in the PostgreSQL `ztf_documents` table instead of as a
host-visible file. Export the request to the host before running the privileged
update helper.

1. In connected staging, create the offline update package and transfer it to
   the appliance access workstation.
2. In **Appliance Ops > Updates**, import the package, review the manifest,
   click **Verify**, then click **Stage**. Confirm the UI reports
   `Staged v1.5.3`.
3. SSH to the AHV appliance VM as the appliance Linux administrator:

   ```bash
   ssh ztfadmin@<appliance-ip>
   ```

4. Confirm the expected containers are running:

   ```bash
   cd /opt/ztf-orchestrator
   sudo docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Image}}"
   ```

   A PostgreSQL-backed appliance should include containers similar to
   `ztf-orchestrator` and `ztf-orchestrator-postgres`.

5. Export the staged update request from PostgreSQL to the host path expected
   by the update helper:

   ```bash
   sudo bash -c 'docker exec ztf-orchestrator-postgres psql -U ztf -d ztf_orchestrator -tA -c "copy (select data::text from ztf_documents where name='\''appliance_update_request.json'\'') to stdout" > /opt/ztf-orchestrator/appliance_update_request.json'
   sudo python3 -m json.tool /opt/ztf-orchestrator/appliance_update_request.json
   ```

   Check that the JSON shows the expected `target`, `version`,
   `containerImage`, and `checksum`.

6. Copy the image tar to the appliance host. From a Windows transfer host, for
   example:

   ```powershell
   scp "C:\Share\ztf-update-v1.5.3\images\ztf-orchestrator-v1.5.3-image.tar" ztfadmin@<appliance-ip>:/home/ztfadmin/
   ```

7. Move the image tar into the appliance update artifact directory:

   ```bash
   sudo mkdir -p /opt/ztf-orchestrator/update-artifacts
   sudo mv /home/ztfadmin/ztf-orchestrator-v1.5.3-image.tar /opt/ztf-orchestrator/update-artifacts/
   sudo ls -lh /opt/ztf-orchestrator/update-artifacts/ztf-orchestrator-v1.5.3-image.tar
   ```

8. Apply the staged request with explicit host paths:

   ```bash
   sudo env \
     ZTF_UPDATE_REQUEST_FILE=/opt/ztf-orchestrator/appliance_update_request.json \
     ZTF_UPDATE_IMAGE_TAR=/opt/ztf-orchestrator/update-artifacts/ztf-orchestrator-v1.5.3-image.tar \
     /opt/ztf-orchestrator/appliance/scripts/apply-update-request.sh
   ```

   In a fully air-gapped environment, a later `docker compose pull` attempt may
   fail to resolve `ghcr.io`. That is expected after `docker load` succeeds;
   the helper continues and applies the locally loaded image.

   Before restarting the service, the helper creates host-side pre-update
   safety artifacts under:

   ```text
   /opt/ztf-orchestrator/update-artifacts/pre-update-backups/
   ```

   The safety artifacts include a PostgreSQL custom dump and a compressed
   `/var/lib/ztf-orchestrator` data directory snapshot. The helper stops if it
   cannot create these backups unless `ZTF_REQUIRE_PRE_UPDATE_BACKUP=0` is set
   for a controlled recovery case with an independent VM or database backup.

9. Verify the appliance after the helper completes:

   ```bash
   curl http://localhost:5001/health
   sudo docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
   sudo grep ZTF_ORCHESTRATOR_VERSION /opt/ztf-orchestrator/.env
   sudo systemctl status ztf-orchestrator --no-pager
   ```

10. Sign in to the web UI, confirm the footer or settings page reports v1.5.3,
    verify the key workflows still load, then click **Mark Applied** in
    **Appliance Ops > Updates**.

### Post-Upgrade State Validation and Recovery

After an appliance update, validate that the application is still reading the
expected state store before running new workflows. The following items should
remain visible:

- execution and run history;
- imported or created config files;
- approval requests and approval history;
- PostgreSQL backup inventory under **Settings > Storage**.

If these items are missing together, treat it as a state-store issue rather than
four independent UI issues. Do not run `docker compose down -v`, delete Docker
volumes, or create replacement records until the active storage has been
checked.

Run these checks on the appliance host:

```bash
cd /opt/ztf-orchestrator
sudo docker compose --env-file .env -f appliance/docker-compose.appliance.yml ps
sudo docker volume ls | grep ztf
sudo grep -E 'ZTF_ORCHESTRATOR_VERSION|ZTF_DATABASE_URL|POSTGRES_PASSWORD' .env
```

Check whether the active PostgreSQL database still contains application
documents:

```bash
sudo docker exec ztf-orchestrator-postgres psql -U ztf -d ztf_orchestrator \
  -c "select name, updated_at from ztf_documents order by name;"

sudo docker exec ztf-orchestrator-postgres psql -U ztf -d ztf_orchestrator \
  -c "select count(*) as audit_events from ztf_audit_events;"
```

Check whether backup files still exist in the application data volume:

```bash
sudo docker exec ztf-orchestrator \
  find /var/lib/ztf-orchestrator/backups/postgres -maxdepth 1 -type f -name 'ztf-orchestrator-*.dump' -ls
```

If the active database is empty but older Docker volumes still exist, take a VM
snapshot first, then inspect the volume names before attempting recovery. The
pre-update helper artifacts, when present, are the preferred recovery source:

```bash
sudo ls -lh /opt/ztf-orchestrator/update-artifacts/pre-update-backups/
```

Restore only during a maintenance window. A PostgreSQL dump can be restored
through **Settings > Storage** if it is visible to the application, or manually
with `pg_restore` after stopping the application container and taking a fresh VM
snapshot.

### Framework Checkout

Use this when the appliance has a host-visible framework git checkout. It is
not for immutable framework copies baked inside an image.
In an air-gapped environment, import the approved tag or commit into that git
checkout before running the helper; the helper will attempt a remote fetch but
can still check out a local ref when the fetch is unavailable.

1. In a connected staging environment, identify the release tag to apply.
2. Create an offline manifest for ZeroTouch Framework:

   ```json
   {
     "target": "ztf-framework",
     "version": "v1.5.2",
     "repository": "nutanixdev/zerotouch-framework",
     "targetPath": "/opt/zerotouch-framework",
     "sourceRef": "v1.5.2",
     "releaseUrl": "https://github.com/nutanixdev/zerotouch-framework/releases/tag/v1.5.2",
     "checksum": "",
     "notes": "Framework ref reviewed in connected staging."
   }
   ```

3. Or create an offline manifest for NKP Framework:

   ```json
   {
     "target": "nkp-framework",
     "version": "v2.17.1",
     "repository": "VirtuArchitect/nkp-zerotouch-framework",
     "targetPath": "/var/lib/ztf-orchestrator/nkp-zerotouch-framework",
     "sourceRef": "v2.17.1",
     "releaseUrl": "https://github.com/VirtuArchitect/nkp-zerotouch-framework/releases/tag/v2.17.1",
     "checksum": "",
     "notes": "NKP framework ref reviewed in connected staging."
   }
   ```

4. Transfer the manifest through the approved air-gapped media process.
5. In **Appliance Ops > Updates**, paste the manifest under **Offline Manifest
   Import** and click **Import Manifest**.
6. Confirm the target path is a git checkout on the appliance host:

   ```bash
   test -d /opt/zerotouch-framework/.git
   test -d /var/lib/ztf-orchestrator/nkp-zerotouch-framework/.git
   ```

7. Click **Verify**, then **Stage**.
8. Run the update helper:

   ```bash
   sudo /opt/ztf-orchestrator/appliance/scripts/apply-update-request.sh
   ```

9. Confirm the framework status in the UI, then mark the update applied.

## Rollback

For ZTF-Orchestrator container updates, the helper script backs up the appliance
`.env` before changing the image tag:

```text
/opt/ztf-orchestrator/.env.pre-update-<timestamp>
```

To roll back:

```bash
cd /opt/ztf-orchestrator
sudo cp .env.pre-update-<timestamp> .env
sudo systemctl restart ztf-orchestrator
curl http://localhost:5001/health
```

Keep PostgreSQL backups and VM snapshots aligned with your operational change
process before applying production updates.

For framework checkout updates, the helper stores the previous short commit ref
inside the target checkout:

```text
<targetPath>/.ztf-orchestrator-pre-update-ref
```

To roll back a framework checkout:

```bash
previous_ref="$(cat /opt/zerotouch-framework/.ztf-orchestrator-pre-update-ref)"
sudo git -C /opt/zerotouch-framework checkout "${previous_ref}"
```

## Security Model

- Release checks are restricted to allowlisted GitHub repositories.
- Container image names are restricted to the approved ZTF-Orchestrator image
  namespace.
- Framework updates require an absolute target path and a safe git ref.
- Manifest-only imports store metadata and rely on a manually staged host
  artifact path or git checkout.
- Package imports extract only manifest-referenced relative artifact paths,
  reject traversal, enforce configured size limits, and verify SHA-256 before
  staging.
- Staging requires admin role.
- Host-level changes require root access on the appliance VM.
- Update events are recorded in the application audit log.
