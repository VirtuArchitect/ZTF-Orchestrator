# RB-002 - Backup and Restore

Current release marker: `v1.7.10`.

## Metadata

| Field | Value |
|---|---|
| Runbook ID | RB-002 |
| Title | Backup and restore |
| Version | 1.0 |
| Owner | Platform operations |
| Approver | Platform lead |
| Classification | Internal operational procedure |
| Status | Approved |

## Purpose

Create and restore ZTF-Orchestrator operational state backups with explicit
approval, evidence capture, and post-restore validation.

## Scope

Covers PostgreSQL logical backups exposed by **Settings > Storage** and the
maintenance backup APIs. File-backed backup handling is limited to copying
`ZTF_DATA_DIR` through an approved host procedure while the service is stopped.

## Preconditions

- App version, storage backend, and deployment mode are known.
- No workflow, NKP, schedule, pipeline, or restore job is running.
- Restore has explicit approval and a selected backup file.

## Required Role/RBAC

App admin for backup/restore actions. Host or database administrator for direct
database recovery.

## Required Inputs

- Backup filename or destination.
- Restore approval ID for restore operations.
- Expected restore point.
- Current change ticket.

## Dependencies

- PostgreSQL mode requires `pg_dump` and `pg_restore` in the application
  container or host path.
- `ZTF_DATA_DIR/backups/postgres/` must be writable.
- Restore requires healthy database connectivity.

## Risk/Impact

Backup is low impact. Restore is high impact because it can roll back users,
sessions, settings, jobs, approvals, evidence, and audit data.

## Procedure

1. Confirm **Jobs / Queue** has no running or cancelling jobs.
2. Open **Settings > Storage**.
3. Confirm storage backend and latest backup posture.
4. For backup, click **Create Backup** and wait for completion.
5. For restore, review the selected backup, obtain approval, type the required
   confirmation, and start restore.
6. Restart the application after restore so in-memory sessions and workers load
   restored state.
7. Reopen **Settings > Storage**, **Jobs / Queue**, **Approvals**, and
   **Audit Log**.

## Validation

- Backup file is listed and downloadable.
- Restore creates a safety backup first.
- App returns healthy after restart.
- Expected users, jobs, approvals, configs, evidence, and audit records are
  present for the selected restore point.

## Expected Result

A backup is available or the application state is restored to the approved point
without running jobs or orphaned operational state.

## Failure Conditions

- Backup creation fails.
- Restore is attempted while jobs are running or cancelling.
- Restore completes but application health fails.
- Restored data does not match the approved restore point.

## Recovery/Rollback

If restore fails, stop the service and escalate to [RB-010](RB-010-database-recovery.md).
Use the safety backup created by the restore flow when a rollback is required.

## Evidence To Capture

- Operator and approver.
- Backup filename and checksum if exported.
- Restore approval ID.
- Health check after restore.
- Storage page screenshot or exported backup inventory.
- Audit event for backup or restore.

## Audit Requirements

Restore requires a change ticket, approval record, and post-restore validation
record. Backups created before high-risk work must be referenced by later job
evidence.

## Escalation

Escalate before retrying restore if database errors, missing state, or running
job conflicts appear.

## References

- [PostgreSQL Backend](../postgresql-backend.md)
- [PostgreSQL Backup Restore Drill](../postgresql-backup-restore-drill.md)
- [Runbook Index](README.md)

## Evidence Mapping

| Evidence | Source | Required |
|---|---|---|
| Backup file | Settings/API | Yes |
| Restore approval | Approvals/change ticket | Restore only |
| Safety backup | Settings/API | Restore only |
| Audit event | Audit Log | Yes |
