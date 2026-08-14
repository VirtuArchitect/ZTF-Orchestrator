# RB-009 - User and RBAC Management

Current release marker: `v1.7.5`.

## Metadata

| Field | Value |
|---|---|
| Runbook ID | RB-009 |
| Title | User and RBAC management |
| Version | 1.0 |
| Owner | Platform operations |
| Approver | Platform lead |
| Classification | Internal operational procedure |
| Status | Draft |

## Purpose

Create, update, disable, or remove ZTF-Orchestrator user access while preserving
auditability and least-privilege role assignment.

## Scope

Covers local application users and roles. It does not cover external identity
provider integration or operating system accounts.

## Preconditions

- Access request or removal request is approved.
- Required role is known.
- Emergency access or break-glass accounts are handled through a separate
  controlled process.

## Required Role/RBAC

App admin.

## Required Inputs

- Username.
- Requested role.
- Requestor and approver.
- Business reason.
- Expiration or review date where applicable.

## Dependencies

- Settings > Users.
- Audit Log.
- Storage backend.

## Risk/Impact

Incorrect roles can permit workflow execution, approval, backup, restore, or
administrative changes beyond the user's need.

## Procedure

1. Confirm the access request and role.
2. Open **Settings > Users**.
3. Create or update the user with the minimum required role.
4. For removal, confirm the account is no longer needed and remove it.
5. Verify audit records remain available for historical actions.
6. Record the change in the access review log or ticket.

## Validation

- User can sign in only when expected.
- Role matches approved access.
- Audit event is present.
- Existing audit records remain attributable.

## Expected Result

Access reflects the approved request and remains traceable.

## Failure Conditions

- User is assigned the wrong role.
- Removal affects required operational access.
- Audit record is missing.

## Recovery/Rollback

Correct the role or recreate the account with approved access. Investigate audit
or storage issues before making further access changes.

## Evidence To Capture

- Access request.
- Approver.
- Username and role.
- Change timestamp.
- Audit event.

## Audit Requirements

Keep access requests and audit events for all admin role changes and removals.

## Escalation

Escalate suspected unauthorized access or privilege misuse to
[RB-011](RB-011-security-incident.md).

## References

- [Production Readiness Boundary](../production-readiness-boundary.md)
- [Runbook Index](README.md)

## Evidence Mapping

| Evidence | Source | Required |
|---|---|---|
| Access request | Ticket/access system | Yes |
| Role assignment | Settings > Users | Yes |
| Audit event | Audit Log | Yes |
