# RB-008 - NKP Safe Phase Execution

Current release marker: `v1.7.2`.

## Metadata

| Field | Value |
|---|---|
| Runbook ID | RB-008 |
| Title | NKP safe phase execution |
| Version | 1.0 |
| Owner | Platform operations |
| Approver | Platform lead |
| Classification | Internal operational procedure |
| Status | Draft |

## Purpose

Run constrained NKP ZeroTouch Framework safe phases through ZTF-Orchestrator
with profile validation, approval, job tracking, and readiness evidence.

## Scope

Covers NKP phases exposed by the current integration. Apply, registry push,
upgrade, and destroy actions remain blocked server-side in this release.

## Preconditions

- NKP framework path is configured.
- NKP binary/source is registered.
- Deployment profile validates as ready or accepted with documented warnings.
- Required approval is approved.
- Generated YAML is reviewed.

## Required Role/RBAC

Operator/admin for profile preparation and safe phase submission. Approver/admin
for controlled phases.

## Required Inputs

- NKP profile ID and revision.
- Generated YAML/config reference.
- NKP binary/source reference.
- Approval ID.
- Target Prism Central and cluster details.

## Dependencies

- NKP Framework page.
- NKP binary registry.
- Validation Evidence.
- Jobs / Queue.
- Target Nutanix endpoints.

## Risk/Impact

NKP safe phases can prepare deployment artifacts and interact with target
systems. Treat profile revision, generated YAML, and approval binding as part of
the control boundary.

## Procedure

1. Open **NKP Framework**.
2. Review profile fields, node inventory, Prism Central endpoint, networking,
   and binary/source references.
3. Run deployment readiness validation.
4. Generate or review YAML.
5. Request approval for controlled phase execution.
6. Submit the safe phase job with the approved profile revision.
7. Monitor **Jobs / Queue**.
8. Capture Validation Evidence with profile revision, generated YAML, approval,
   job output, and target-side checks.

## Validation

- Readiness validation is pass or accepted with documented warnings.
- Submitted job references the expected profile revision.
- Job reaches completed state.
- Generated YAML and evidence bundle are retained.

## Expected Result

The approved safe phase completes with traceable NKP profile, YAML, job, and
evidence records.

## Failure Conditions

- Profile readiness is blocked.
- Approval is missing or stale.
- Profile revision changes after approval.
- Job fails or target-side validation disagrees.

## Recovery/Rollback

Use [RB-005](RB-005-failed-job-recovery.md). Do not continue with downstream NKP
steps until the failed phase is understood.

## Evidence To Capture

- Profile ID, name, and revision.
- Generated YAML reference.
- NKP binary/source reference.
- Approval ID.
- Job ID and logs.
- Readiness record.
- Target-side confirmation.

## Audit Requirements

Evidence must bind approval to the exact profile revision and generated YAML
used for execution.

## Escalation

Escalate when readiness is blocked, revision mismatch occurs, or target state is
unclear after failure.

## References

- [NKP v2.17 Alignment](../nkp-v217-alignment.md)
- [UAT Evidence Checklist](../uat-evidence-checklist.md)
- [Runbook Index](README.md)

## Evidence Mapping

| Evidence | Source | Required |
|---|---|---|
| Profile revision | NKP Framework | Yes |
| Readiness result | Validation Evidence | Yes |
| Approval | Approvals | Yes |
| Job output | Jobs / Queue | Yes |
