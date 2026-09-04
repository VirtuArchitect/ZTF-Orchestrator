# Native Foundation Controlled UAT Operations Review

Current release marker: `v1.8.1`.

Controlled UAT operations review collects the operational readiness blockers
that must be reviewed before any future native Foundation hardware-UAT adapter
lane can be explicitly enabled. It carries the security and runbook
retained-evidence export, secret-audit persistence, and packet output/export
gate prerequisites into the operations evidence set.

This capability cannot approve UAT, reserve maintenance windows, acquire locks,
persist change tickets, or start runners.

## API

```text
POST /api/native-foundation/uat/operations-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "providerId": "manual_static",
  "deploymentType": "hci",
  "phase": "full_deployment",
  "approvalId": "<optional approval id>",
  "evidenceId": "<optional validation evidence id>",
  "operationsOwner": "ops-lead",
  "maintenanceTicket": "private-change/CHG-2001",
  "backupEvidenceRef": "private-backup-evidence/BKP-2001"
}
```

Valid intent returns `200` with a blocked read-only operations review. Invalid
intent returns `400`.

## Operations Items

Each `operationsItems` item includes:

- Operations item ID.
- Label.
- Source artifact and source ID.
- Status.
- Evidence summary.
- Required prerequisite artifacts when the item depends on retained evidence
  export, secret audit persistence, runner readiness, or retention review
  artifacts.
- Source review status for retained evidence export and secret audit
  persistence where applicable.
- Inherited adapter request packet gate counts, step audit event counts, adapter
  output evidence status, retained evidence export review status, and adapter
  command invocation status when `approvalId` and `evidenceId` bind to the same
  review packet.
- `mutatingActionsEnabled: false`.

The review covers controlled UAT runbook review, security review,
retained-evidence export prerequisite, secret-audit persistence prerequisite,
packet output/export gate summary, recovery plan, evidence retention plan,
future lock scope, declared operations owner, declared private maintenance or
change ticket, declared private backup or restore evidence reference, and the
final operations approval disablement block.

## Metadata

The optional metadata fields are reviewed as text only:

- `operationsOwner`
- `maintenanceTicket`
- `backupEvidenceRef`

Supplying these values can clear the corresponding metadata items, but the final
operations approval remains blocked.

## Boundary

Controlled UAT operations review cannot approve UAT, persist signoff, reserve
maintenance windows, persist change tickets, acquire locks, enable adapters,
resolve secrets, start jobs, issue permits, call Foundation, contact Prism
Element, contact BMCs, export retained evidence, persist secret audit entries,
create backups, restore state, or mutate infrastructure.

A future operations approval path must be an explicit enablement change with
private change evidence, backup or restore proof, lock ownership, operator
signoff, evidence retention, and controlled hardware UAT scope.
