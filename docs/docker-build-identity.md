# Docker build identity

Current source uses `v1.8.5-rc1` as its default Docker version. Local Compose
builds now use `ztf-orchestrator:v1.8.5-rc1` rather than the ambiguous local
`latest` tag. Compose forwards the version, optional commit/date and exact image
name into Docker, so Settings > About and `/health` can identify the running build.
This remains controlled UAT; the GitHub Latest stable release remains v1.8.4.

## Rebuild from reviewed source

Use a clean checkout of the intended merged revision. Preserve unrelated work
in other checkouts; do not reset, stash or overwrite it to perform a release.
An appliance bundle updates its container image, not an unrelated host checkout.

```bash
git status --short
docker compose config --images
docker compose build ztf-orchestrator
docker compose up -d --no-deps --no-build ztf-orchestrator
docker inspect ztf-orchestrator --format '{{.Config.Image}}'
```

Review the status before building and make sure no jobs/pipelines are active
before replacing a live service. Retain backups and the old image for rollback.
Do not print the entire rendered Compose configuration publicly: it can contain
resolved database credentials. `config --images` displays only image names.

The default app image is `ztf-orchestrator:v1.8.5-rc1`. Optional variables:

| Variable | Purpose |
| --- | --- |
| `ZTF_ORCHESTRATOR_VERSION` | Source release tag or matching patch suffix |
| `ZTF_ORCHESTRATOR_IMAGE` | Exact image to build/start; also baked into identity |
| `ZTF_BUILD_COMMIT` | Known full source commit; leave unset if unknown |
| `ZTF_BUILD_DATE` | Build timestamp supplied by the release process |

The default version is tested against `package.json`, the Dockerfile,
`.env.example`, backend and frontend release metadata. Commit-specific release
builds may use a suffix such as `v1.8.5-rc1-<commit>`. Registry CI `sha-...`
versions require a matching supplied full commit. The guard runs before runtime
installation and rejects stale version values such as `v1.8.4` on current RC
source. It does not attest that a checkout is clean or that an operator-supplied
commit is genuine; release builds must independently verify source provenance.

## Existing environment files and local image pins

Existing `.env` files are not overwritten. Remove or correct stale version values
before a source rebuild. An explicit old image selection remains an intentional
deployment pin: `compose up` alone does not build, inspect or upgrade its source.

Machine-local `docker-compose.override.yml`, `docker-compose.override.yaml`,
`compose.override.yml` and `compose.override.yaml` files are ignored by Git and
excluded from Docker build contexts. They can pin an approved appliance image
and disable local rebuilding; keep them when intentionally using a verified
image instead of a development checkout. Review them when selecting a new build.
Using an explicit `-f` list requires explicitly listing any desired override too.
Do not remove existing overrides without reviewing their mounts/settings first.

The permanent fix is in merged source. A stale, unmerged checkout still needs to
be updated separately; adding a version label to old code does not update it.

## Verify the running service

```bash
docker inspect ztf-orchestrator --format '{{.Config.Image}}'
docker inspect ztf-orchestrator --format '{{.State.Health.Status}}'
curl -fsS http://127.0.0.1:15001/health
```

For default local Compose, the published port is 15001; appliance installations
commonly use 5001. Require a healthy container and the intended `installed.versionTag`,
`installed.commit` when supplied, and `installed.containerImage`. A bare source
build has no commit unless one was explicitly provided. Older applied-package
history does not override the running image's build identity. Hard-refresh the
browser after replacement. Do not treat a loaded image or staged request as a
verified running update.
