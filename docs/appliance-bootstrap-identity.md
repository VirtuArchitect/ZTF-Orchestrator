# Fresh appliance guided update identity

Updated appliance source establishes a rollback-eligible image baseline before
first boot is marked complete. Older QCOW2 artifacts, including Build #67, retain
their original contents. This change does not retrofit an already deployed VM.

## Build and profile behavior

The AHV workflow resolves the requested source ref once to a full Git commit,
reads its package version and derives a versioned tag such as
`v1.8.5-rc1-0123456789ab`. All selected profiles use that same source and tag.
`image_version=auto` is the default. Legacy `latest`, `main` and matching SHA-tag
inputs resolve to the same versioned baseline; they are never persisted as moving
appliance pins. Explicit version inputs must match the source package version.

Packer checks out the exact resolved commit without falling back to another
branch. Application builds receive the version, full source commit, source date
and image reference. A conflicting existing image tag is rejected rather than
overwritten. The standard guided appliance uses the standard GHCR repository.

| Profile | Image provision | First boot |
|---|---|---|
| Standard | Build a source-stamped application and preload PostgreSQL | Reuse the verified application image; no refresh of its versioned tag |
| Airgap | Build and preload in connected staging | Reuse local images; stop if required images are missing, with no registry pull |
| Minimal | Record source/version identity without preloading application images | Fetch the matching source image, verify the full commit, then create the local versioned alias; fetch PostgreSQL if absent |

Minimal requires registry connectivity and a published container for its exact
source commit. The shortened registry SHA is only a lookup: the helper verifies
the full image commit, build version, Linux/amd64 platform and update-protocol
label before creating an alias. Missing or mismatched images stop bootstrap;
there is no fallback to `latest` or another source revision.

## First-boot persistence and guided updates

The generated `.env` contains the resolved version. The appliance Compose file
uses that value both for its image and for the application's reported version and
image metadata. `pull_policy: never` prevents systemd or later Compose starts
from replacing the prepared application image implicitly. The guided updater
continues to load approved images explicitly and retains its existing approvals,
idle checks, backups, identity verification and explicit rollback safeguards.

First boot records completion only after the exact running image ID, local
rollback tag, application health and reported version agree. An interrupted
bootstrap retains its private pending marker and generated database credentials
for a retry. It never creates new credentials over an existing partial `.env`.
An existing installation with `.env` and no pending marker is left unchanged.
Bootstrap files and identity manifests are root-owned/private; they contain no
cluster credentials. No PE, PC, Foundation, SSH or cluster mutation is performed
by the image-identity helper.

After deployment, confirm the VM's own identity:

```bash
sudo systemctl status ztf-orchestrator-firstboot --no-pager
sudo docker inspect ztf-orchestrator \
  --format 'Image={{.Config.Image}} ID={{.Image}} Health={{.State.Health.Status}}'
sudo docker exec ztf-orchestrator python -c \
  'import json,urllib.request; h=json.load(urllib.request.urlopen("http://127.0.0.1:5001/health",timeout=10)); print(h["status"]); print(h["installed"]["versionTag"])'
```

The tag should be versioned, health should be `healthy`, and the reported version
should match the tag. A future update still requires a complete verified offline
ZIP, a fresh readiness plan and its exact-version approval. Keep the previous
image and the database/data backup pair until verification and acceptance.

## Verification boundaries

Regression coverage uses fake Docker responses and a disconnected Linux shell
sandbox for Standard/Airgap reuse, Minimal source lookup, missing-image refusal,
existing-install preservation and interrupted-bootstrap retry. The actual host
updater's plan/archive/backup/install/rollback paths use synthetic packages and
mocked Docker endpoints. Packer syntax and Compose rendering are checked
separately. These checks do not establish AHV import/boot or production hardware
validation. Full QCOW2 artifacts and deployed-appliance tests remain separate
deliverables from the merged source and application container.
