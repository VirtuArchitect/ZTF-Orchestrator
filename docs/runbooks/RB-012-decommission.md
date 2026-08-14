# RB-012 - Decommission

Current release marker: `v1.7.5`.

## Metadata

| Field | Value |
|---|---|
| Runbook ID | RB-012 |
| Title | Decommission |
| Version | 1.0 |
| Owner | Platform operations |
| Approver | Platform lead |
| Classification | Internal operational procedure |
| Status | Draft |

## Purpose

Retire a ZTF-Orchestrator deployment while preserving required evidence,
backups, audit records, and target-system continuity.

## Scope

Covers application, container, appliance, and Kubernetes starter deployments.
It does not delete target Nutanix infrastructure created by prior workflows.

## Preconditions

- Decommission is approved.
- No jobs, schedules, or pipelines should continue.
- Evidence retention requirements are known.
- Final backup and export plan is approved.

## Required Role/RBAC

App admin plus host, container, cluster, or database administrator.

## Required Inputs

- Deployment identifier.
- Retention period.
- Final backup destination.
- Target systems affected by prior workflows.
- Approval ID.

## Dependencies

- Backup/export capability.
- Host/container/cluster runtime access.
- Evidence storage location.

## Risk/Impact

Improper decommission can lose audit/evidence records or leave operators without
visibility into prior infrastructure changes.

## Procedure

1. Disable schedules and prevent new job submissions.
2. Confirm no jobs are running or cancelling.
3. Export or capture validation evidence and audit records required for
   retention.
4. Create a final backup.
5. Record configured ZTF/NKP paths, deployment mode, and version.
6. Stop the service.
7. Archive backups and evidence outside the application.
8. Remove runtime resources only after archive validation.

## Validation

- Final backup exists and is readable.
- Required evidence is archived.
- Service is stopped.
- No dependent operator process relies on the retired instance.

## Expected Result

The deployment is retired with required records preserved and no active
automation path left behind.

## Failure Conditions

- Backup fails.
- Evidence export is incomplete.
- Jobs are still active.
- Ownership of prior target changes is unclear.

## Recovery/Rollback

Restart the service from the final backup if decommission must be reversed.
Validate state before allowing new jobs.

## Evidence To Capture

- Decommission approval.
- Final version.
- Final backup filename/checksum.
- Evidence archive location.
- Stop command/result.
- Resource removal record.

## Audit Requirements

Retain the final backup and decommission record according to the organization's
evidence retention period.

## Escalation

Escalate if retention requirements are unclear or target-system ownership is not
documented.

## References

- [Backup and Restore](RB-002-backup-restore.md)
- [Production Readiness Boundary](../production-readiness-boundary.md)
- [Runbook Index](README.md)

## Evidence Mapping

| Evidence | Source | Required |
|---|---|---|
| Final backup | Settings/API/DBA | Yes |
| Archive location | Records system | Yes |
| Stop result | Host/container/cluster output | Yes |
