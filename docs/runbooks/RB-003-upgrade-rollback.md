# RB-003 - Upgrade and Rollback

Current release marker: `v1.7.7`.

## Metadata

| Field | Value |
|---|---|
| Runbook ID | RB-003 |
| Title | Upgrade and rollback |
| Version | 1.0 |
| Owner | Platform operations |
| Approver | Platform lead |
| Classification | Internal operational procedure |
| Status | Approved |

## Purpose

Upgrade ZTF-Orchestrator through a controlled release path and preserve a
rollback option for application and operational state.

## Scope

Covers application upgrades for Docker Compose, appliance, and Kubernetes
starter deployments. Framework checkout and air-gapped package updates are
covered by [RB-007](RB-007-airgapped-update.md) and the appliance update guide.

## Preconditions

- Target release tag and release notes are reviewed.
- Current version and Git/source tag are recorded.
- Backup is complete and verified.
- No jobs are running or cancelling.
- Rollback image/tag and database restore point are available.

## Required Role/RBAC

App admin plus host, container, or cluster administrator.

## Required Inputs

- Current version.
- Target version.
- Container image or package reference.
- Backup filename.
- Approval ID/change ticket.

## Dependencies

- Release artifact availability.
- Docker, systemd, or Kubernetes runtime.
- PostgreSQL backup/restore capability when using PostgreSQL.

## Risk/Impact

Upgrade may change application behavior, database document shape, bundled
frontend assets, and workflow guardrails. Treat rollback as both an application
version rollback and an operational state decision.

## Procedure

1. Create a backup with [RB-002](RB-002-backup-restore.md).
2. Record current version from the UI or `/health`.
3. Review release notes and compatibility notes.
4. Stop new work by disabling schedules or pausing operator submissions.
5. Apply the upgrade using the deployment-specific procedure.
6. Restart the service.
7. Validate health, login, storage, jobs, approvals, audit log, and at least one
   read-only screen.
8. Re-enable schedules only after validation passes.

## Validation

- `/health` reports the target version.
- `README.md`, UI version, and package release agree for the installed build.
- Dashboard, Jobs, Approvals, Settings, and Audit Log load.
- Existing state is visible.
- No unexpected running or failed jobs appear.

## Expected Result

The service runs the approved target version with preserved operational state
and documented validation evidence.

## Failure Conditions

- Target version does not start.
- Health check or login fails.
- Operational state is missing or inconsistent.
- New errors appear in service logs.

## Recovery/Rollback

Stop the upgraded service, restore the previous image/tag, and decide whether to
restore the pre-upgrade backup. If state was modified after upgrade, do not
blindly restore without approval because newer evidence or audit events may be
lost.

## Evidence To Capture

- Current and target versions.
- Release URL or artifact checksum.
- Backup filename.
- Approval ID.
- Health result after upgrade.
- Service logs for startup.
- Post-upgrade screen or API validation notes.

## Audit Requirements

Keep the backup reference, upgrade approval, release artifact, validation notes,
and rollback decision together.

## Escalation

Escalate if rollback requires data restore, if jobs were running during upgrade,
or if target-side workflow state may have changed.

## References

- [Appliance Update Manager](../appliance-update-manager.md)
- [Installation Guide](../installation-guide.md)
- [Runbook Index](README.md)

## Evidence Mapping

| Evidence | Source | Required |
|---|---|---|
| Version before/after | UI or `/health` | Yes |
| Backup | Settings/API | Yes |
| Artifact reference | Release/package record | Yes |
| Validation result | Change ticket | Yes |
