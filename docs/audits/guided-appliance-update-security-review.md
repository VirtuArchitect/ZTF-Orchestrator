# Guided appliance update implementation review

## Scope and boundary

The optional host service adds privileged, administrator-approved appliance image
installation. Application endpoints remain admin-only; imported manifests alone
cannot execute updates. The application receives two restricted spool mounts and
a supplemental host group, not a Docker socket, sudo command or privileged mode.
No runtime dependency or database migration is added. Health responses gain
backward-compatible storage/maintenance flags; update records gain a computed
package-availability field. Root-owned plans and reports are separate from the
existing application document schema.

## Controls reviewed

- Fixed operation allowlist, fixed Docker/Compose/database commands, no shell
  interpolation, arbitrary host path, arbitrary download URL or database-restore RPC.
- Administrator bearer authentication, role tests, request limits, single pending
  queue slot, immutable root-owned plans, expiry, exact version confirmation and
  durable request IDs prevent accidental duplicate installations.
- Disk, service health, PostgreSQL backend, other maintenance, queued/running work,
  image checksum/tag/protocol and installed image are rechecked before cutover.
  Application mutation and execution guards remain active during interrupted cutovers.
- Active pipeline/framework streams are tracked independently of durable queue jobs.
  Their lifecycle counter is included in host readiness checks; late-starting streams
  recheck maintenance. Configuration payload fields named `status` do not count as jobs.
- Artifact paths are constrained to the named data volume and package UUID;
  symlink components/roots and traversal are rejected. Request reads use bounded,
  no-follow regular-file descriptors. Image archives are inspected, not extracted
  into the host filesystem; member count/configuration size limits apply.
- Only explicitly selected, currently eligible cleanup entries can be removed.
  Running/rollback image packages, selected update, latest hash-verified service
  backup pair, unknown records and legacy backups are retained. No volume/image prune.
- Application writes stop before database/data backup. PostgreSQL archive listing,
  full gzip read, tar traversal and SHA-256 receipts verify integrity/readability.
  A successful archive listing alone is not a restore rehearsal. The root-readable
  data archive includes host environment/Compose files and is sensitive.
- Private image copy is rehashed, target Compose tag is checked, and post-update
  checks verify the exact image ID, application identity/health and database readiness.
- No automatic installation replay or database rollback. A pre-start failure can
  restart the old image; post-start failure retains maintenance. Manual image rollback
  requires explicit approval and independent database compatibility confirmation.
- Results are read-only to the application. Private plans/state and backup secrets
  are not returned through the console. Command output/exceptions are not echoed into
  public errors. Browser examples and test accounts contain generic fixture data.

## Validation and remaining requirements

Targeted host/protocol/API tests cover happy paths, backup failure, changed or
expired plans, checksum/tag mismatch, traversal, legacy image rejection, cleanup
protection, interrupted updates, rollback approval, active jobs, role enforcement
and stale/malformed service state. Browser checks exercise upload, readiness,
cleanup selection, exact approval, response loss, reconnect, roles and narrow layout.

The Linux daemon smoke verifies actual non-root spool access, protected host state,
archive production, restart/no replay and symlink rejection with simulated Docker.
The separate PostgreSQL 16 rehearsal uses a real disposable database, backup,
restore and record readback. Both production/demo builds and release-integrity
checks form part of validation.

A real systemd/appliance cutover, disk-pressure failure rehearsal, reboot during
cutover and complete application/data recovery rehearsal remain required in UAT.
The host service is installed and upgraded separately from an application image.
Do not run manual host updates or database restore concurrently with this service.

The model trusts appliance administrators and approved release sources. An embedded
checksum proves integrity, not publisher identity. Host-root access and the Docker
daemon remain trusted. Custom layouts, unattended downloads, automatic database
restore and a standalone recovery web portal are outside this implementation.
If the application cannot serve the console, host/VM recovery access is required.
