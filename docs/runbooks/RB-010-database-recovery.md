# RB-010 - Database Recovery

Current release marker: `v1.7.12`.

## Metadata

| Field | Value |
|---|---|
| Runbook ID | RB-010 |
| Title | Database recovery |
| Version | 1.0 |
| Owner | Platform operations |
| Approver | Platform lead |
| Classification | Internal operational procedure |
| Status | Draft |

## Purpose

Recover PostgreSQL-backed ZTF-Orchestrator state when normal application-level
restore is unavailable or insufficient.

## Scope

Covers PostgreSQL-backed deployments. File-backed state recovery is limited to
restoring `ZTF_DATA_DIR` from an approved copy while the app is stopped.

## Preconditions

- Incident or recovery ticket exists.
- Service is stopped or placed into maintenance.
- Selected backup and restore target are approved.
- Current database state is preserved when possible.

## Required Role/RBAC

Database administrator plus app admin.

## Required Inputs

- Database URL or managed database identifier.
- Backup file or platform restore point.
- Recovery objective.
- Approval ID.

## Dependencies

- PostgreSQL server.
- `pg_restore` or managed database recovery tooling.
- App deployment runtime.

## Risk/Impact

Database recovery can roll back users, sessions, jobs, approvals, evidence, and
audit events. Treat it as critical operational recovery.

## Procedure

1. Stop ZTF-Orchestrator.
2. Preserve current database state if possible.
3. Verify the selected backup or restore point.
4. Restore using managed database tooling or `pg_restore` under DBA control.
5. Start ZTF-Orchestrator.
6. Validate `/health`, login, storage, jobs, approvals, configs, evidence, and
   audit log.
7. Record any expected data loss window.

## Validation

- Application starts.
- Database-backed documents load.
- Expected recovery point is present.
- Data loss window is documented.

## Expected Result

ZTF-Orchestrator state is restored to the approved point and the service is
usable.

## Failure Conditions

- Restore fails.
- Application schema initialization fails.
- Expected documents are missing.
- Audit/evidence continuity cannot be explained.

## Recovery/Rollback

Stop the service and restore the previous preserved state or an alternate backup
under DBA approval.

## Evidence To Capture

- Recovery approval.
- Backup/restore point.
- DBA command or platform event.
- Health result.
- Data loss window.
- Post-recovery validation notes.

## Audit Requirements

Keep database recovery evidence outside the application too, because app audit
events may be part of the restored data set.

## Escalation

Escalate to DBA, platform lead, and target-system owners when recovery affects
in-flight infrastructure work.

## References

- [PostgreSQL Backend](../postgresql-backend.md)
- [Backup and Restore](RB-002-backup-restore.md)
- [Runbook Index](README.md)

## Evidence Mapping

| Evidence | Source | Required |
|---|---|---|
| Restore point | DBA/backup system | Yes |
| Health result | `/health` | Yes |
| Data loss window | Recovery ticket | Yes |
