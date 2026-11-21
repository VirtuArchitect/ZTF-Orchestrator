# RB-008 - Historical NKP Record Review

Current release marker: `v1.8.5-rc1` (prerelease; production deployment use reported separately).

## Metadata

| Field | Value |
|---|---|
| Runbook ID | RB-008 |
| Title | Historical NKP record review |
| Version | 1.0 |
| Owner | Platform operations |
| Approver | Platform lead |
| Classification | Internal operational procedure |
| Status | Retired execution and review only |

## Purpose

Review retained NKP records without submitting new work. NKP console setup and execution are retired; earlier safe-phase instructions do not apply.

## Scope

Authenticated review of retained profiles, binaries, historical approvals, jobs and evidence where read endpoints remain available. New mutating NKP requests are rejected with HTTP 410.

## Preconditions

- Authorized access to retained records.
- Exact historical job/profile identifiers and an evidence-retention owner.
- No new NKP execution, uploads or configuration changes.

## Required Role/RBAC

Use an authenticated role permitted to inspect the record. Administrator access does not re-enable retired execution.

## Required Inputs

- Historical profile ID/revision, job ID and evidence reference.
- Retention requirements and the incident/change record when applicable.

## Dependencies

Retained authenticated read endpoints, Jobs / Queue, approvals and saved evidence. A baked runtime is not an available console launcher.

## Risk/Impact

Historical records may contain sensitive references. Redact exports and preserve audit evidence. Do not run old phase commands to reproduce a record.

## Procedure

1. Identify the historical job, profile revision and approval.
2. Review saved inputs and logs through permitted read paths.
3. Record collection time, source build and unresolved target-side outcomes.
4. Retain a redacted export under the applicable retention policy.
5. Use a separately reviewed supported toolchain for any new platform work; this runbook authorizes none.

## Validation

- No new job or mutation was submitted.
- Historical IDs, revision and evidence remain traceable.
- Retired records are clearly labelled as historical.

## Expected Result

Historical intent and evidence are understood and retained. No new NKP execution or live compatibility claim is made.

## Failure Conditions

- Required historical records cannot be found or their identity is uncertain.
- An earlier procedure asks for a new phase submission or bypass of retirement controls.

## Recovery/Rollback

Stop the review if source identity is uncertain. Preserve records and use [RB-005](RB-005-failed-job-recovery.md) for investigation. Do not re-enable retired routes or delete records to follow old instructions.

## Evidence To Capture

Historical profile/revision, job, approval and source build; redacted logs; retention owner and any unresolved target-side effects.

## Audit Requirements

Preserve the original approval-to-input binding and distinguish historical evidence from new validation.

## Escalation

Escalate missing records, conflicting identities or requests to bypass retirement to the application and evidence owners.

## References

- [Console retirement](../console-retirement.md)
- [UAT Evidence Checklist](../uat-evidence-checklist.md)
- [Runbook Index](README.md)

## Evidence Mapping

| Evidence | Source | Required |
|---|---|---|
| Historical profile revision | Retained records | When present |
| Historical approval | Approvals | When present |
| Job output | Jobs / Queue | When present |
| Review provenance | Review record | Yes |
