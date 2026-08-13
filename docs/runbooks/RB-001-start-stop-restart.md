# RB-001 - Start, Stop, Restart

Current release marker: `v1.7.1`.

## Metadata

| Field | Value |
|---|---|
| Runbook ID | RB-001 |
| Title | Start, stop, restart |
| Version | 1.0 |
| Owner | Platform operations |
| Approver | Platform lead |
| Classification | Internal operational procedure |
| Status | Approved |

## Purpose

Start, stop, or restart ZTF-Orchestrator while preserving operational state and
confirming the service returns healthy.

## Scope

Covers manual, Docker Compose, systemd/appliance, and Kubernetes starter
deployments. It does not cover application upgrades, database restore, or
host-level operating system maintenance.

## Preconditions

- Deployment mode is known.
- Operator has host, container, or cluster access for the deployment mode.
- No high-risk workflow is running unless the restart is part of an approved
  recovery action.

## Required Role/RBAC

Host administrator, container administrator, or cluster administrator. App admin
access is required to inspect jobs, users, backups, and audit state.

## Required Inputs

- Deployment mode.
- Application URL.
- Service, Compose project, or Kubernetes namespace name.
- Current maintenance ticket or operational note.

## Dependencies

- Host, Docker, systemd, or Kubernetes runtime.
- PostgreSQL service when using the PostgreSQL backend.
- Configured `ZTF_DATA_DIR` and framework paths.

## Risk/Impact

Restarting may interrupt UI sessions and queued work. Running jobs should be
allowed to finish or be handled through [RB-006](RB-006-emergency-stop.md) when
urgent.

## Procedure

1. Check current health:

   ```bash
   curl http://localhost:5001/health
   ```

2. Review **Jobs / Queue** and confirm no job is running, cancelling, or in an
   unknown state.
3. Stop or restart using the deployment mode:

   ```bash
   docker compose stop
   docker compose up -d
   ```

   ```bash
   sudo systemctl restart ztf-orchestrator
   sudo systemctl status ztf-orchestrator
   ```

   ```bash
   kubectl -n ztf-orchestrator rollout restart deployment/ztf-orchestrator
   kubectl -n ztf-orchestrator rollout status deployment/ztf-orchestrator
   ```

4. Open the UI and sign in.
5. Confirm **Dashboard**, **Settings > Storage**, and **Audit Log** load.

## Validation

- `/health` returns healthy.
- Login succeeds.
- Dashboard shows expected storage backend.
- No unexpected failed job appears after restart.

## Expected Result

The service is reachable, state is preserved, and operators can continue from
the same job, approval, schedule, config, evidence, and audit data.

## Failure Conditions

- Health check fails.
- Login fails.
- PostgreSQL-backed deployment cannot connect to the database.
- Jobs remain stuck in running/cancelling state after restart.

## Recovery/Rollback

Use service logs, Docker logs, or Kubernetes events to identify startup errors.
For database issues, use [RB-010](RB-010-database-recovery.md). For stuck jobs,
use [RB-005](RB-005-failed-job-recovery.md).

## Evidence To Capture

- Operator.
- Timestamp.
- Deployment mode.
- Health check output.
- Service status output.
- Any affected job IDs.

## Audit Requirements

Record restart reason and validation result in the change ticket. Keep relevant
app audit events when available.

## Escalation

Escalate if the app cannot return healthy or if persisted operational state is
missing after restart.

## References

- [Installation Guide](../installation-guide.md)
- [systemd Guide](../systemd.md)
- [Runbook Index](README.md)

## Evidence Mapping

| Evidence | Source | Required |
|---|---|---|
| Health result | `/health` | Yes |
| Service state | Docker/systemd/Kubernetes output | Yes |
| Operator action | Change ticket/audit note | Yes |
