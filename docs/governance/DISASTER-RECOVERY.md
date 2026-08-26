# Disaster Recovery

Current release marker: `v1.7.12`.

Disaster recovery is required for a production-assessable ZTF-Orchestrator
deployment because the platform stores operational state: users, sessions,
settings, jobs, approvals, schedules, configs, validation evidence, audit
events, and backups.

## Minimum DR Objectives

Define these per deployment:

- Recovery Point Objective (RPO).
- Recovery Time Objective (RTO).
- Backup location and retention.
- Restore environment.
- Secret rotation requirements.
- Evidence retention requirements.
- Owner and escalation path.

## Recovery Sources

| Source | Purpose |
|---|---|
| PostgreSQL logical backup | Restore users, sessions, jobs, approvals, evidence, and audit records |
| VM/container backup | Restore runtime host or appliance state |
| Git tag/image artifact | Rebuild the application version |
| Offline update package | Rebuild in disconnected environments |
| Exported evidence packs | Preserve UAT/change evidence outside the app |

## DR Procedure Summary

1. Declare incident and freeze new workflow execution.
2. Preserve the current failed state where possible.
3. Select restore point and validate approval.
4. Rebuild or restore the runtime.
5. Restore database or file-backed state.
6. Restart and validate `/health`.
7. Validate login, users, jobs, approvals, audit log, configs, and evidence.
8. Record data loss window and residual risks.

Use [RB-002 Backup and Restore](../runbooks/RB-002-backup-restore.md) and
[RB-010 Database Recovery](../runbooks/RB-010-database-recovery.md) for detailed
operator procedures.
