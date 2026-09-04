# Native Foundation Controlled UAT Security Review

Current release marker: `v1.8.1`.

Controlled UAT security review collects the security blockers that must be
reviewed before any future native Foundation hardware-UAT adapter lane can be
explicitly enabled. It carries the controlled UAT scope and runbook
retained-evidence export, secret-audit persistence, and packet output/export
gate prerequisites into the security evidence set.

This capability cannot approve UAT or persist security signoff.

## API

```text
POST /api/native-foundation/uat/security-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "providerId": "manual_static",
  "deploymentType": "hci",
  "phase": "full_deployment",
  "approvalId": "<optional approval request id>",
  "evidenceId": "<optional validation evidence id>",
  "securityReviewer": "security-lead",
  "securityReviewRef": "private-security-review/SR-1001"
}
```

Valid intent returns `200` with a blocked read-only security review. Invalid
intent returns `400`.

## Security Items

Each `securityItems` item includes:

- Security item ID.
- Label.
- Source artifact and source ID.
- Status.
- Evidence summary.
- Required prerequisite artifacts when the item depends on retained evidence
  export, secret audit persistence, runner readiness, or retention review
  artifacts.
- Source review status for retained evidence export and secret audit
  persistence where applicable.
- Inherited adapter output evidence, retained export review, command invocation,
  and packet gate summary counts when approval/evidence binding is supplied.
- `mutatingActionsEnabled: false`.

The review covers bounded scope, controlled UAT runbook, secret-store boundary,
retained-evidence export prerequisite, secret-audit persistence prerequisite,
packet output/export gate review, audit and retention boundary, disabled
adapter registry state, declared security reviewer, declared private security
review reference, and the final security approval disablement block.

## Metadata

The optional metadata fields are reviewed as text only:

- `securityReviewer`
- `securityReviewRef`

Supplying these values can clear the corresponding metadata items, but the final
security approval remains blocked.

## Boundary

Controlled UAT security review cannot approve UAT, persist signoff, enable
adapters, resolve secrets, open secret-store leases, start jobs, issue permits,
acquire locks, call Foundation, contact Prism Element, contact BMCs, append
audit events, export retained evidence, persist secret audit entries, create
backups, restore state, or mutate infrastructure.

A future security approval path must be an explicit enablement change with
private security evidence, RBAC signoff, adapter allow-listing, audited secret
handling, evidence retention, and controlled hardware UAT scope.
