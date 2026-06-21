# Appliance Update Manager

The Appliance Update Manager provides a controlled update workflow for
ZTF-Orchestrator appliances. It separates release discovery and operator
approval in the web UI from host-level Docker and systemd changes.

The web application does not unpack arbitrary source archives or mutate its own
container. Instead, it records verified update metadata and stages a host-side
update request. A privileged administrator then runs the appliance helper script
on the VM.

## What It Updates

The first implementation targets the ZTF-Orchestrator appliance container image.

It does not automatically replace:

- the AHV QCOW2 image itself;
- the baked ZeroTouch Framework version;
- NKP framework or bundle payloads;
- host operating system packages.

Use the NKP Framework and appliance build workflows for those artifacts.

## Connected Update Flow

1. Open **Appliance Ops > Updates**.
2. Confirm the repository is allowlisted. The default is:

   ```text
   VirtuArchitect/ZTF-Orchestrator
   ```

3. Select whether prereleases should be included.
4. Click **Check GitHub**.
5. Review the discovered release metadata, container image tag, release URL, and
   assets.
6. Click **Verify** after confirming the release is intended for the appliance.
7. As an admin, click **Stage**.
8. SSH to the appliance VM and run:

   ```bash
   sudo /opt/ztf-orchestrator/appliance/scripts/apply-update-request.sh
   ```

9. Verify health:

   ```bash
   curl http://localhost:5001/health
   sudo systemctl status ztf-orchestrator
   ```

10. Return to **Appliance Ops > Updates** and click **Mark Applied**.

## Air-Gapped Update Flow

Use this when the appliance cannot reach GitHub or GHCR.

1. In a connected staging environment, download or build the target appliance
   container image.
2. Save the image to a tar file:

   ```bash
   docker pull ghcr.io/virtuarchitect/ztf-orchestrator:vX.Y.Z
   docker save ghcr.io/virtuarchitect/ztf-orchestrator:vX.Y.Z \
     -o ztf-orchestrator-vX.Y.Z-image.tar
   sha256sum ztf-orchestrator-vX.Y.Z-image.tar
   ```

3. Create an offline update manifest:

   ```json
   {
     "version": "vX.Y.Z",
     "repository": "VirtuArchitect/ZTF-Orchestrator",
     "containerImage": "ghcr.io/virtuarchitect/ztf-orchestrator:vX.Y.Z",
     "sourceRef": "vX.Y.Z",
     "releaseUrl": "https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/tag/vX.Y.Z",
     "checksum": "<sha256-of-transferred-image-tar>",
     "notes": "Transferred through the approved air-gapped media process."
   }
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

## Rollback

The helper script backs up the appliance `.env` before changing the image tag:

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

## Security Model

- Release checks are restricted to allowlisted GitHub repositories.
- Container image names are restricted to the approved ZTF-Orchestrator image
  namespace.
- Offline imports store metadata only. They do not extract archives.
- Staging requires admin role.
- Host-level changes require root access on the appliance VM.
- Update events are recorded in the application audit log.

