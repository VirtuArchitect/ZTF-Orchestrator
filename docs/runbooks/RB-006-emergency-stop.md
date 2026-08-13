# RB-006 - Emergency Stop

Current release marker: `v1.7.1`.

## Metadata

| Field | Value |
|---|---|
| Runbook ID | RB-006 |
| Title | Emergency stop |
| Version | 1.0 |
| Owner | Platform operations |
| Approver | Platform lead |
| Classification | Internal operational procedure |
| Status | Approved |

## Purpose

Stop ZTF-Orchestrator activity when automation behaves unexpectedly or continued
execution could harm infrastructure, evidence integrity, or operational control.

## Scope

Covers application job cancellation, schedule disabling, worker/service stop,
and escalation. It does not define target-side rollback; use the failed-job
runbook after stopping.

## Preconditions

- Operator has a credible reason to stop work.
- Affected job, schedule, pipeline, or target is identified where possible.
- Operator can reach the application or host control plane.

## Required Role/RBAC

Operator/admin for job cancellation. Admin or host administrator for disabling
service workers or stopping the application.

## Required Inputs

- Job ID, schedule, or pipeline name if known.
- Target environment.
- Observed unsafe condition.
- Time emergency stop began.

## Dependencies

- Jobs / Queue cancellation controls.
- Schedule controls.
- Host, Docker, systemd, or Kubernetes access if app-level stop is insufficient.

## Risk/Impact

Stopping a workflow may leave target infrastructure partially changed. The goal
is to prevent additional changes, then triage before rerun or rollback.

## Procedure

1. In **Jobs / Queue**, cancel the affected job when cancellation is available.
2. Disable related schedules or pipeline triggers.
3. If app-level cancellation is not enough, stop the application service:

   ```bash
   docker compose stop ztf-orchestrator
   ```

   ```bash
   sudo systemctl stop ztf-orchestrator
   ```

   ```bash
   kubectl -n ztf-orchestrator scale deployment/ztf-orchestrator --replicas=0
   ```

4. Record the exact stop time.
5. Preserve logs and audit events.
6. Move to [RB-005](RB-005-failed-job-recovery.md).

## Validation

- No new jobs are starting.
- Related schedules are disabled or service workers are stopped.
- Logs and audit events are preserved.
- Target-side state is ready for triage.

## Expected Result

Automation stops progressing and operators have enough evidence to assess what
changed.

## Failure Conditions

- Job continues after cancellation.
- Host/service stop is unavailable.
- Target-side task continues independently after Orchestrator stop.
- Evidence is missing or overwritten.

## Recovery/Rollback

Use [RB-005](RB-005-failed-job-recovery.md). Restart the service only after the
platform lead approves the recovery plan.

## Evidence To Capture

- Operator.
- Stop reason.
- Stop timestamp.
- Job IDs, schedule names, or pipeline names.
- Service stop command and result.
- Preserved logs.
- Target-side task IDs.

## Audit Requirements

Record emergency stop as an incident or high-priority operational event. Link
the follow-up failed-job recovery record.

## Escalation

Escalate immediately to the platform lead and target-system owner.

## References

- [Failed Job Recovery](RB-005-failed-job-recovery.md)
- [Start, Stop, Restart](RB-001-start-stop-restart.md)
- [Runbook Index](README.md)

## Evidence Mapping

| Evidence | Source | Required |
|---|---|---|
| Stop reason | Incident/change ticket | Yes |
| Job state | Jobs / Queue | Conditional |
| Service state | Host/container/cluster output | Yes |
| Target task | Nutanix target | Conditional |
