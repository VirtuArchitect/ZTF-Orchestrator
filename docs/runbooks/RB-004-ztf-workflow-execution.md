# RB-004 - ZTF Workflow Execution

Current release marker: `v1.7.7`.

## Metadata

| Field | Value |
|---|---|
| Runbook ID | RB-004 |
| Title | ZTF workflow execution |
| Version | 1.0 |
| Owner | Platform operations |
| Approver | Platform lead |
| Classification | Internal operational procedure |
| Status | Approved |

## Purpose

Execute an allowlisted ZeroTouch Framework 1.x workflow or script through
ZTF-Orchestrator with validation, approval, job tracking, and evidence capture.

## Scope

Covers workflows and scripts exposed in the ZTF-Orchestrator catalog. It does
not cover direct CLI execution outside the application, unsupported ZTF 2.x
`plan/apply`, or uncontrolled destructive actions.

Standalone Foundation Central Appliance cluster-create intent uses the
`cluster-create-standalone-fca` workflow and `create_fca_cluster.yml`. Its Dry
Run is read-only and validates Lifecycle v4.3 inventory. Run Workflow is blocked
until the destructive standalone FCA deployment sequence is implemented and
validated.

## Preconditions

- Orchestrator is healthy.
- ZTF path and Python runtime are configured.
- Target Nutanix endpoints are reachable.
- YAML/config validation passes.
- Required approval is approved and unexpired.
- Backup exists for high-risk configuration changes.

## Required Role/RBAC

Operator or admin to submit allowed work. Approver/admin for approval-gated
workflows.

## Required Inputs

- Workflow or script ID.
- Validated YAML/config file.
- Target environment.
- Approval ID where required.
- Backup reference where applicable.

## Dependencies

- ZeroTouch Framework 1.x checkout.
- Config Files and YAML Studio for generated or edited YAML.
- Jobs / Queue background worker.
- Approvals, Audit Log, and Validation Evidence.

## Risk/Impact

ZTF workflows can mutate Nutanix infrastructure. A failed or cancelled workflow
may leave target state partially changed, so rerun decisions require triage.

## Procedure

1. Confirm `/health` is healthy and the dashboard has no blocking readiness
   warnings.
2. Generate, import, or review the YAML/config file in the workflow page,
   **YAML Studio**, or **Config Files**.
3. If importing a workflow config, confirm the imported YAML/JSON matches the
   selected workflow and review the **YAML Preview** before execution.
4. Run server-side validation.
5. Confirm the target environment and operator intent.
6. Request approval when the workflow policy requires it.
7. Select the approved workflow or script.
8. Attach the validated config and approval ID.
9. Submit the job.
10. Monitor **Jobs / Queue** until it reaches a terminal state.
11. Capture validation evidence from job output, audit events, config hash, and
    target-side checks.

## Validation

- Job status is completed.
- No unresolved execution errors remain.
- Expected target-side state is observed in Prism Central, Prism Element,
  Foundation Central, or another approved target system.
- Validation Evidence includes job, approval, config, and operator references.

## Expected Result

The intended allowlisted workflow completes with traceable evidence and no
unresolved target-side discrepancy.

## Failure Conditions

- YAML/config validation fails.
- Required approval is missing, rejected, or expired.
- Job fails, is cancelled, or has unknown status.
- Target-side state does not match expected state.

## Recovery/Rollback

Do not blindly rerun. Use [RB-005](RB-005-failed-job-recovery.md) to determine
what completed, whether the workflow is idempotent, and whether remediation or
rollback is required.

## Evidence To Capture

- Job ID.
- Operator.
- Approver and approval ID.
- Timestamp.
- YAML/config filename and hash.
- Target system.
- Execution log.
- Validation result.
- Relevant audit events.
- Target-side confirmation.

## Audit Requirements

Workflow evidence must connect the operator, approver, config, job, validation
result, and target-side confirmation.

## Escalation

Escalate before rerun when a workflow mutates infrastructure and completion
state is unclear.

## References

- [UAT Evidence Checklist](../uat-evidence-checklist.md)
- [Validation Status](../validation-status.md)
- [Runbook Index](README.md)

## Evidence Mapping

| Evidence | Source | Required |
|---|---|---|
| Config hash | Config Files/YAML Studio | Yes |
| Approval | Approvals | Conditional |
| Job output | Jobs / Queue | Yes |
| Target confirmation | Nutanix target | Yes |
