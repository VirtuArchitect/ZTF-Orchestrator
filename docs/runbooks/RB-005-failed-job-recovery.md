# RB-005 - Failed Job Recovery

Current release marker: `v1.7.10`.

## Metadata

| Field | Value |
|---|---|
| Runbook ID | RB-005 |
| Title | Failed job recovery |
| Version | 1.0 |
| Owner | Platform operations |
| Approver | Platform lead |
| Classification | Internal operational procedure |
| Status | Approved |

## Purpose

Recover from failed, cancelled, stuck, or unknown ZTF-Orchestrator jobs without
creating duplicate or unsafe infrastructure changes.

## Scope

Covers ZTF workflows, scripts, pipelines, schedules, parallel runs, and NKP safe
phase jobs submitted through the application.

## Preconditions

- The affected job ID is known.
- Operator has access to job logs, audit events, config/profile inputs, and
  target-side systems.
- No dependent workflow stage is started until triage is complete.

## Required Role/RBAC

Operator or admin to inspect jobs. Admin or approver involvement is required for
rerun, rollback, or target-side remediation of high-risk jobs.

## Required Inputs

- Job ID.
- Workflow/script/NKP phase.
- Config file or profile revision.
- Approval ID where applicable.
- Target system.
- Error text and timestamp.

## Dependencies

- Jobs / Queue.
- Audit Log.
- Validation Evidence.
- Target Nutanix or framework logs.

## Risk/Impact

Retrying a failed infrastructure job can duplicate work, collide with partially
created resources, or overwrite target state. Treat rerun as a new controlled
action after triage.

## Procedure

1. Stop dependent pipeline, schedule, or manual workflow stages.
2. Open the failed job and export or copy the log.
3. Identify the last completed step, command, task UUID, or target-side marker.
4. Review app audit events for the same timestamp and operator.
5. Check the target system for created, changed, failed, or pending resources.
6. Classify the failure:
   - preflight/config failure;
   - launch/runtime failure before mutation;
   - partial mutation with known completed steps;
   - unknown target state;
   - cancellation/emergency stop.
7. Decide remediation:
   - fix config and submit a new approved job;
   - resume through a narrower workflow if safe;
   - roll back target-side changes;
   - open a support/escalation case;
   - leave state unchanged and document the exception.
8. Capture recovery evidence.

## Validation

- Failed job state is understood.
- Target-side state is documented.
- Remediation or no-action decision is approved.
- New evidence references the original failed job.

## Expected Result

The failed job is closed with a documented cause, target-state assessment, and
approved recovery path.

## Failure Conditions

- Target-side state cannot be determined.
- Logs do not show whether mutation occurred.
- A rerun would be unsafe or non-idempotent.
- Multiple systems disagree about final state.

## Recovery/Rollback

Use workflow-specific rollback instructions, target-side tooling, or vendor
support procedures. Restore application state only when the failure is caused by
application data corruption; use [RB-002](RB-002-backup-restore.md) or
[RB-010](RB-010-database-recovery.md).

## Evidence To Capture

- Original job ID.
- Error message and log excerpt.
- Config/profile reference.
- Approval ID.
- Target-side state.
- Recovery decision.
- New job ID if rerun.
- Audit events before and after recovery.

## Audit Requirements

The recovery record must link the original job, triage findings, recovery
approval, and final state.

## Escalation

Escalate immediately when target-side state is unknown, partially changed, or
requires manual remediation outside the application.

## References

- [ZTF Workflow Execution](RB-004-ztf-workflow-execution.md)
- [Emergency Stop](RB-006-emergency-stop.md)
- [Runbook Index](README.md)

## Evidence Mapping

| Evidence | Source | Required |
|---|---|---|
| Failed job log | Jobs / Queue | Yes |
| Target state | Nutanix target | Yes |
| Recovery decision | Change ticket | Yes |
| Follow-up job | Jobs / Queue | Conditional |
