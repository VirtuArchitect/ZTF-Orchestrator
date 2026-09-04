# ZTF-Orchestrator Appliance Update Console Recovery

Current release marker: `v1.8.1`.

Use this when the web console does not load after applying a current
ZTF-Orchestrator appliance update package.

## Important

Do not rerun the update until the current container state has been captured.

The intended appliance update artifact is the release ZIP package:

```text
ztf-update-<version>.zip
```

The ZIP contains a manifest, checksum metadata, and the Docker image tar:

```text
images/ztf-orchestrator-<version>-image.tar
```

If the image tar was applied directly, instead of importing and staging the ZIP
through **Appliance Ops > Updates**, the appliance may be pointing at a tag that
was not correctly loaded or staged.

## Capture Current State

Run these commands on the appliance:

```bash
cd /opt/ztf-orchestrator

sudo docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"

sudo systemctl status ztf-orchestrator --no-pager

sudo docker logs --tail 120 ztf-orchestrator

sudo grep -E 'ZTF_ORCHESTRATOR_VERSION|ZTF_HOST_BIND|ZTF_HOST_PORT|POSTGRES_PASSWORD|ZTF_DATABASE_URL' .env
```

Check whether the application is alive locally:

```bash
curl -i http://127.0.0.1:5001/health
curl -i http://127.0.0.1:15001/
```

## Fast Rollback

The update helper should have created an `.env` backup before applying the
update. List the available backups:

```bash
cd /opt/ztf-orchestrator
ls -lt .env.pre-update-*
```

Restore the newest backup:

```bash
cd /opt/ztf-orchestrator
sudo cp .env.pre-update-YYYYMMDDHHMMSS .env
sudo systemctl restart ztf-orchestrator
sudo docker ps
curl -i http://127.0.0.1:5001/health
```

Replace `YYYYMMDDHHMMSS` with the newest actual timestamp shown by `ls`.

## Likely Causes

- The image tar was applied directly instead of importing and staging the ZIP
  package through Appliance Ops.
- `.env` now points to a version tag, but the matching image tag was not loaded.
- The container is starting but failing due to an environment or Compose
  mismatch.

## Package Details

Expected ZIP package:

```text
ztf-update-<version>.zip
```

Expected ZIP SHA256:

```text
Use the matching published .sha256 file or release checksum entry.
```

Expected image tag from the package manifest:

```text
ghcr.io/virtuarchitect/ztf-orchestrator:<version>
```
