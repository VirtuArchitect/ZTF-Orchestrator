# Native Foundation Controlled UAT Runbook Review

Current release marker: `v1.8.0`.

Controlled UAT runbook review binds a future hardware-UAT lane to the operator
metadata and runbook steps that must be reviewed before any native Foundation
adapter path can be explicitly enabled. It carries the controlled UAT scope
review's retained-evidence export, secret-audit persistence, and packet
output/export gate prerequisites into the runbook steps and source review
status.

This capability cannot approve UAT or start deployment.

## API

```text
POST /api/native-foundation/uat/runbook-review
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
  "rollbackOwner": "platform-oncall",
  "uatWindow": "2026-09-15T20:00Z/2026-09-15T22:00Z",
  "evidenceRetentionTarget": "private-evidence-vault/native-foundation/uat-001"
}
```

Valid intent returns `200` with a blocked read-only runbook review. Invalid
intent returns `400`.

## Runbook Steps

Each `runbookSteps` item includes:

- Step ID.
- Label.
- Source artifact.
- Status.
- Required prerequisite artifacts where the step depends on retained evidence
  export, secret audit persistence, runner readiness, or retention review
  artifacts.
- Source review status for retained evidence export and secret audit
  persistence where applicable.
- Inherited adapter output evidence, retained export review, command invocation,
  and packet gate summary counts when approval/evidence binding is supplied.
- `mutatingActionsEnabled: false`.

The review declares steps for scope confirmation, UAT window confirmation,
retained-evidence, secret-audit, and packet gate prerequisite confirmation,
rollback owner confirmation, evidence retention confirmation, review packet
export, adapter dry-run review, manual stop criteria, and post-UAT evidence
capture.

## Operator Metadata

The optional metadata fields are reviewed as text only:

- `rollbackOwner`
- `uatWindow`
- `evidenceRetentionTarget`

Supplying these values can clear the corresponding metadata checks, but the
final runbook authorization check remains blocked.

## Boundary

Controlled UAT runbook review cannot approve UAT, reserve hardware, load
adapters, start jobs, issue permits, acquire locks, resolve secrets, call
Foundation, contact Prism Element, contact BMCs, append audit events, persist
retained evidence, export retained evidence, persist secret audit entries,
create backups, restore state, or mutate infrastructure.

A future runbook approval path must be an explicit enablement change with named
hardware scope, rollback ownership, evidence retention, security review,
operator signoff, and controlled hardware UAT evidence handling.
