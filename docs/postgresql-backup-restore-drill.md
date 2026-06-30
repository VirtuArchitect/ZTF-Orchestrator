# PostgreSQL Backup and Restore Drill

This drill validates that a ZTF-Orchestrator PostgreSQL-backed deployment can be
backed up, restored, and returned to service without using production data.

## Scope

- Target: safe UAT deployment only.
- Storage backend: `ZTF_STORAGE_BACKEND=postgres`.
- Data handling: use sanitized UAT records, never customer secrets, passwords,
  tokens, or environment-specific IP evidence in the repository.
- Operator roles: one admin to create/restore backups and one observer to verify
  service behavior after restart.

## Preconditions

1. Confirm the deployment is UAT and not serving production workflows.
2. Confirm the current `ZTF_DATABASE_URL` points to the UAT database.
3. Confirm a recent application restart is possible after restore.
4. Export or record only sanitized evidence:
   - Orchestrator version.
   - Storage backend.
   - Backup filename.
   - Restore timestamp.
   - Health/readiness result.
   - One non-sensitive audit event ID or job ID.

## Drill Steps

1. Sign in as an admin.
2. Open **Settings > Storage**.
3. Confirm the backend shows PostgreSQL.
4. Create a database backup.
5. Download or record the backup filename and size.
6. Create a disposable UAT evidence record or audit-visible action.
7. Restore the backup through the restore dialog by typing `RESTORE`.
8. Restart the Orchestrator service.
9. Sign back in and confirm:
   - `/api/health` returns healthy.
   - Settings load successfully.
   - Audit log loads successfully.
   - Jobs page loads successfully.
   - The expected pre-restore state is present.
   - The disposable post-backup record is absent if it was created after the backup.

## Sanitized Record

```yaml
drill_id: pg-restore-uat-YYYYMMDD
orchestrator_version: v1.5.2
storage_backend: postgres
environment: uat
backup:
  filename: ztf-backup-YYYYMMDD-HHMMSS.json
  size_bytes: 0
restore:
  started_at: YYYY-MM-DDTHH:MM:SSZ
  completed_at: YYYY-MM-DDTHH:MM:SSZ
  service_restarted: true
verification:
  health: pass
  settings_load: pass
  audit_log_load: pass
  jobs_load: pass
  rollback_behavior: pass
notes: Sanitized; no workplace, customer, host, IP, credential, or ticket data.
```

## Current v1.5.2 Status

The repository includes backup and restore API coverage plus this safe UAT drill
pattern. The real UAT restore should be executed against the target UAT
PostgreSQL database and recorded with the sanitized record above.
