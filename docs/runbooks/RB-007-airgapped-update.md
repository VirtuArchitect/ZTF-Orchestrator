# RB-007 - Air-Gapped Update

Current release marker: `v1.7.6`.

## Metadata

| Field | Value |
|---|---|
| Runbook ID | RB-007 |
| Title | Air-gapped update |
| Version | 1.0 |
| Owner | Platform operations |
| Approver | Platform lead |
| Classification | Internal operational procedure |
| Status | Draft |

## Purpose

Apply a disconnected ZTF-Orchestrator appliance update using verified transfer
media, checksums, offline package metadata, and a host-side update helper.

## Scope

Covers ZTF-Orchestrator container image packages and staged appliance update
requests. It does not cover replacing the AHV QCOW2 image, host OS patching, or
unreviewed framework tree mutations.

## Preconditions

- Target release is approved.
- Offline package or transferred image tar checksum is recorded.
- Pre-update backup exists.
- Appliance host administrator is available.
- No jobs are running or cancelling.

## Required Role/RBAC

App admin to import, verify, and stage the package. Appliance host administrator
to run the privileged helper.

## Required Inputs

- Offline package or image tar path.
- Manifest version and target.
- SHA-256 checksum.
- Backup filename.
- Approval ID.

## Dependencies

- Approved transfer process.
- Appliance Update Manager.
- `appliance/scripts/apply-update-request.sh`.
- Docker and systemd on the appliance host.

## Risk/Impact

Air-gapped updates can strand an appliance if the transferred artifact,
manifest, or rollback image is wrong. Treat checksum verification as mandatory.

## Procedure

1. In connected staging, build or pull the target image.
2. Build the offline update package with `scripts/build_offline_update_package.py`.
3. Record the package SHA-256 and embedded image SHA-256.
4. Transfer the package through the approved media process.
5. In **Appliance Ops > Updates**, import and verify the package.
6. Create a pre-update backup.
7. Stage the update.
8. On the appliance host, run:

   ```bash
   sudo /opt/ztf-orchestrator/appliance/scripts/apply-update-request.sh
   ```

9. Validate `/health`, systemd state, and app login.
10. Mark the update applied.

## Validation

- Manifest version and target match the approval.
- Package and artifact checksums match.
- `/health` reports the expected version.
- App state is preserved after update.

## Expected Result

The appliance runs the approved updated image with preserved state and recorded
offline transfer evidence.

## Failure Conditions

- Checksum mismatch.
- Package import fails.
- Host helper fails.
- Health check fails after update.

## Recovery/Rollback

Rollback to the previous image/tag and decide whether to restore the pre-update
backup. Do not overwrite evidence created during the failed update without
approval.

## Evidence To Capture

- Package filename.
- Package SHA-256.
- Embedded image SHA-256.
- Manifest version and release URL.
- Backup filename.
- Host helper output.
- Post-update health result.

## Audit Requirements

Keep transfer, checksum, approval, backup, helper output, and validation records
together.

## Escalation

Escalate if checksums disagree, helper output is unclear, or rollback requires
database restore.

## References

- [Appliance Update Manager](../appliance-update-manager.md)
- [Upgrade and Rollback](RB-003-upgrade-rollback.md)
- [Runbook Index](README.md)

## Evidence Mapping

| Evidence | Source | Required |
|---|---|---|
| Package checksum | Staging/transfer record | Yes |
| Manifest | Offline package | Yes |
| Backup | Settings/API | Yes |
| Helper output | Appliance host | Yes |
