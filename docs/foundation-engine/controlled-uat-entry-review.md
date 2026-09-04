# Native Foundation Controlled UAT Entry Review

Current release marker: `v1.8.1`.

Controlled UAT entry review composes the final read-only decision record before
any native Foundation adapter can enter a bounded hardware UAT lane. It brings
together runner readiness, adapter activation, adapter registry enablement, UAT
rehearsal cases, controlled UAT signoff, controlled UAT hardware reservation,
secret-store binding, secret audit persistence, audit planning, retained
evidence export prerequisites, packet output/export gate summaries, and
retention planning.

This capability cannot authorize UAT or run deployment.

## API

```text
POST /api/native-foundation/uat/entry-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "providerId": "manual_static",
  "deploymentType": "hci",
  "approvalId": "<optional approval request id>",
  "evidenceId": "<optional validation evidence id>",
  "phase": "full_deployment"
}
```

Valid intent returns `200` with a blocked read-only UAT entry review. Invalid
intent returns `400`.

## Entry Items

Each `entryItems` record includes:

- Entry item ID.
- Label.
- Source artifact and source ID.
- Status.
- Whether the item is required for UAT entry.
- `mutatingActionsEnabled: false`.

The review passes read-only artifact presence checks, then blocks the items that
would require a future explicit enablement path:

- Adapter registry enablement.
- Controlled UAT signoff persistence.
- Controlled UAT hardware reservation persistence.
- Controlled UAT entry issuance.

It also reports remaining runner blockers, provider/deployment scope, approval
and Validation Evidence binding, UAT rehearsal cases, controlled UAT signoff
requirement, controlled UAT hardware reservation record counts, secret-store
binding, retained evidence export prerequisite status, secret audit
persistence, audit plan presence, retention plan presence, and inherited packet
output/export gate coverage. When `approvalId` and `evidenceId` identify the same reviewed native
Foundation package, the packet gate item passes as inherited review coverage;
without that binding, it remains blocked.

## Checks

The response checks:

- UAT entry items are declared.
- Remaining runner blockers are declared.
- Adapter activation remains disabled.
- Adapter registry mutation remains disabled.
- Controlled UAT hardware reservation review is present.
- The final controlled-UAT-entry disablement block.

## Boundary

Controlled UAT entry review cannot authorize hardware testing, load adapters,
start jobs, issue permits, acquire locks, resolve secrets, call Foundation, call
Prism Element, contact BMCs, persist audit events, create backups, restore
state, or mutate hardware.
It also cannot export retained evidence, generate retained evidence ZIPs, write
checksum manifests, or persist secret audit entries.

A future UAT entry path must be a separate explicit change that selects one
provider/topology lane, records and persists hardware scope, validates rollback,
opens approved maintenance windows, enables the bounded adapter path, carries
controlled UAT signoff, retained evidence export, and secret audit persistence
controls, and updates CI, security, backup, disaster recovery, and operator
runbook documentation in the same release.
