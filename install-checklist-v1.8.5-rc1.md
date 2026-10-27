# Installation Checklist v1.8.5-rc1

This candidate is for controlled UAT. Keep the stable appliance available;
do not treat a staged request or loaded image as an applied update.

## Before Installation

- [ ] For source rebuilds, review `.env` and local Compose overrides. Require the
  resolved version/image to match the intended source; do not rebuild an old,
  dirty checkout and expect an appliance image update to refresh those files.
  See [Docker build identity](docs/docker-build-identity.md).

- [ ] Approve the UAT change, owner, maintenance window and rollback point.
- [ ] Review [readiness and outstanding gates](docs/releases/v1.8.5-rc1-readiness.md).
- [ ] Verify the downloaded ZIP against its separately supplied SHA-256.
- [ ] Verify `manifest.json`, `SHA256SUMS`, embedded image SHA-256 and exact
  `ghcr.io/virtuarchitect/ztf-orchestrator:v1.8.5-rc1` image tag.
- [ ] Capture the current build identity, mounts, networks and environment
  securely. Never put captured secrets or lab endpoints in release artifacts.
- [ ] Back up PostgreSQL and application data; validate both archives and
  retain a known-good matching pair. Keep certificate mounts and credential refs.
- [ ] Confirm disk space for backups, compressed image and unpacked layers.
  Stop safely on insufficient space; do not bypass required backups.

## Apply and Verify

For commit-specific updates containing PE user diagnostics, confirm the bundled
runtime emits `[PE-USERS] stage=... category=...` for a controlled failure without
logging credentials or raw responses. A credential-only Dry Run must remain
non-mutating and make no PE requests. Inspect target accounts before retrying
any failed creation/role-assignment run.

1. Import the candidate ZIP through Appliance Ops, or use the documented
   host-side update helper with its candidate request file and image tar.
2. Review the staged request, version, repository, checksum and source reference.
   Explicitly approve this prerelease; the stable `latest` channel must not move.
3. Apply through the approved host-side update procedure. Preserve all data
   volumes, PostgreSQL settings and mounted certificate trust bundles.
4. Inspect the running image and container health, then call `/health` and
   inspect Settings > Installed Build. Require version `1.8.5-rc1`, matching
   image and source identity. Reopen the UI to avoid stale browser assets.
5. Confirm Foundation VM appears in Workflows and the AHV ISO Checksum field is
   present. Do not start a physical deployment just to test the catalog.
6. Test login, RBAC, Upgrade Advisor inventory/save/reopen/export, and scheduled
   live PE DNS/NTP/Pulse collection with approved read-only targets and TLS trust.
7. Restart the isolated UAT appliance and verify saved configuration, schedules,
   assessments, credential references and certificate trust remain available.
8. Exercise restore and rollback in a disposable copy; retain recovery evidence.

For source-derived bundles containing Create Local Users (PE), confirm its
Scripts and pipeline entries, eight distinct credential references, admin-only
confirmation and non-mutating dry run. Test actual PE user creation and role
verification only in an explicitly approved UAT change; inspect partial results
before retrying. See [PE local-user procedure](docs/pe-local-users.md).

## Promotion Signoff

For source-derived bundles containing the PE post-configuration verification fix,
exercise replacement-credential authentication, explicit SKIP without a password
request, property-mismatch rejection and pipeline stop gates in isolated UAT.
Existing containers are not reconciled automatically. See the
[verification procedure](docs/pe-post-configuration-verification.md).

- [ ] Attach test/CI, image/bundle integrity and installed-build receipts.
- [ ] Complete the RC-specific live-UAT and recovery matrix.
- [ ] Complete a 3-5 working-day operational soak with no unresolved blockers.
- [ ] Obtain maintainer and UAT-owner signoff before tagging final v1.8.5.

An unchecked item is not completed by publishing the candidate. Historical
install checklists remain historical evidence, not current installation advice.
