# RB-XXX - Title

Current release marker: `v1.7.7`.

## Metadata

| Field | Value |
|---|---|
| Runbook ID | RB-XXX |
| Title | Title |
| Version | 1.0 |
| Owner | Platform operations |
| Approver | Platform lead |
| Classification | Internal operational procedure |
| Status | Draft |

## Purpose

Describe the operational outcome this runbook produces.

## Scope

Describe the deployment modes, workflows, users, and environments this runbook
covers. State out-of-scope actions explicitly.

## Preconditions

- ZTF-Orchestrator version and deployment mode are known.
- Operator is signed in with the required role.
- Backup, approval, validation, and target prerequisites are satisfied where
  applicable.

## Required Role/RBAC

State the minimum role needed to perform each procedure step.

## Required Inputs

- Target environment.
- Workflow or operation name.
- Config file, profile, package, backup, or evidence reference.
- Approval ID where required.

## Dependencies

- ZTF-Orchestrator application health.
- Storage backend health.
- ZeroTouch Framework or NKP framework path where applicable.
- Target Nutanix endpoint reachability where applicable.

## Risk/Impact

Describe user impact, infrastructure impact, data impact, and whether the action
can be safely repeated.

## Procedure

1. Perform the controlled action.
2. Record intermediate identifiers.
3. Stop and escalate if a failure condition occurs.

## Validation

- Confirm application health.
- Confirm job, audit, backup, or target-side status.
- Confirm evidence was captured.

## Expected Result

Describe the successful end state.

## Failure Conditions

- Required approval is missing or expired.
- Validation fails.
- Job enters failed, cancelled, or unknown state.
- Target-side checks disagree with expected state.

## Recovery/Rollback

Describe recovery steps or reference another runbook.

## Evidence To Capture

- Operator.
- Timestamp.
- Version/tag.
- Approval ID where applicable.
- Job ID where applicable.
- Config/profile/package/backup reference.
- Validation and audit records.
- Target-side confirmation.

## Audit Requirements

Keep the app audit event, change ticket, approval record, and exported evidence
bundle together.

## Escalation

Escalate to the platform lead when validation fails, recovery is unclear, or
target-side state is partially changed.

## References

- [Runbook Index](README.md)
- [UAT Evidence Checklist](../uat-evidence-checklist.md)

## Evidence Mapping

| Evidence | Source | Required |
|---|---|---|
| Operator | App session/change ticket | Yes |
| Action timestamp | App audit log | Yes |
| Result | Job/evidence record | Yes |
