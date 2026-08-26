# RB-011 - Security Incident

Current release marker: `v1.7.11`.

## Metadata

| Field | Value |
|---|---|
| Runbook ID | RB-011 |
| Title | Security incident |
| Version | 1.0 |
| Owner | Platform operations |
| Approver | Security lead |
| Classification | Internal security procedure |
| Status | Draft |

## Purpose

Contain and investigate suspected compromise of ZTF-Orchestrator accounts,
tokens, operational state, update artifacts, or execution controls.

## Scope

Covers application-level incidents involving auth, RBAC, audit logs, jobs,
approvals, config files, backups, update packages, tokens, and suspicious
workflow execution. It does not replace organization-wide incident response.

## Preconditions

- Suspicious activity or exposure is observed.
- Incident owner is assigned.
- Evidence preservation takes priority over cleanup.

## Required Role/RBAC

Security lead, platform lead, app admin, and host/database administrator as
needed.

## Required Inputs

- Incident timestamp.
- Affected users, jobs, configs, backups, or packages.
- Suspected exposure path.
- Current containment decision.

## Dependencies

- Audit Log.
- Host/container logs.
- Database backups.
- Access management records.
- Target Nutanix audit/task history.

## Risk/Impact

Compromised credentials or update artifacts can lead to unauthorized
infrastructure changes or loss of evidence integrity.

## Procedure

1. Preserve logs, audit events, job records, and relevant backups.
2. Disable suspicious accounts or rotate credentials under approval.
3. Stop active jobs or schedules if unauthorized execution is possible.
4. Verify update package checksums and configured repository allowlists when
   update tampering is suspected.
5. Review app audit events, host logs, and target-side task history.
6. Decide whether database restore, credential rotation, or rebuild is required.
7. Document containment, eradication, recovery, and lessons learned.

## Validation

- Unauthorized access path is closed or contained.
- Suspicious jobs are stopped or understood.
- Credentials/tokens are rotated where required.
- Evidence chain is preserved.

## Expected Result

The incident is contained, evidence is preserved, and recovery actions are
approved before normal operation resumes.

## Failure Conditions

- Audit evidence is missing or altered.
- Scope cannot be determined.
- Unauthorized target-side changes occurred.
- Artifact or credential trust cannot be re-established.

## Recovery/Rollback

Use [RB-006](RB-006-emergency-stop.md), [RB-005](RB-005-failed-job-recovery.md),
or [RB-010](RB-010-database-recovery.md) depending on impact.

## Evidence To Capture

- Incident timeline.
- Affected accounts.
- Audit events.
- Job IDs.
- Config/package hashes.
- Credential rotation records.
- Target-side task/audit records.

## Audit Requirements

Store incident records outside the affected application. Keep immutable copies
of app and host logs when possible.

## Escalation

Escalate through the organization's security incident process immediately.

## References

- [Security Assessment](../security/SECURITY_ASSESSMENT.md)
- [Emergency Stop](RB-006-emergency-stop.md)
- [Runbook Index](README.md)

## Evidence Mapping

| Evidence | Source | Required |
|---|---|---|
| Audit events | App/host/target logs | Yes |
| Affected identities | Settings/access records | Yes |
| Containment action | Incident ticket | Yes |
