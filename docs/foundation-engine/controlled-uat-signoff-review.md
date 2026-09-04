# Native Foundation Controlled UAT Signoff Review

Current release marker: `v1.8.1`.

Controlled UAT signoff review composes the final read-only signoff dependency
chain before any future native Foundation hardware-UAT lane can be explicitly
enabled. It carries the operations, security, runbook, and scope
retained-evidence export, secret-audit persistence, UAT evidence acceptance,
and packet output/export gate prerequisites into the signoff evidence set.

This capability cannot persist signoff, issue controlled UAT entry, enable
adapters, load adapter code, or start runners.

## API

```text
POST /api/native-foundation/uat/signoff-review
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
  "signoffOwner": "uat-approver",
  "signoffRef": "private-uat-signoff/UAT-3001"
}
```

Valid intent returns `200` with a blocked read-only signoff review. Invalid
intent returns `400`.

## Signoff Items

Each `signoffItems` item includes:

- Signoff item ID.
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

The review covers controlled UAT scope, runbook, security, operations, UAT
evidence acceptance, adapter allow-list, retained-evidence export prerequisite,
secret-store provider contract, secret audit persistence, packet output/export
gate summary, declared signoff owner, declared private signoff reference, and
the final signoff persistence disablement block.

## Metadata

The optional metadata fields are reviewed as text only:

- `signoffOwner`
- `signoffRef`

Supplying these values can clear the corresponding metadata items, but signoff
persistence, controlled UAT entry issuance, adapter loading, and runner start
remain blocked.

## UAT Evidence Acceptance

The signoff review consumes
[`UAT Evidence Acceptance Review`](uat-evidence-acceptance-review.md). The
`uat-evidence-acceptance-ready` check passes only when the selected
provider/deployment evidence requirements are accepted with evidence IDs and the
review is bound to both `approvalId` and `evidenceId`.

Even when this prerequisite passes, `signoff-persistence-disabled`,
`controlled-uat-entry-issuance-disabled`, and `adapter-loading-disabled` remain
blocked.

## Boundary

Controlled UAT signoff review cannot approve UAT, persist signoff, issue UAT
entry, reserve hardware, persist tickets, acquire locks, enable adapters, load
adapter code, resolve secrets, start jobs, issue permits, call Foundation,
contact Prism Element, contact BMCs, export retained evidence, persist secret
audit entries, or mutate infrastructure.

A future signoff path must be an explicit enablement change with private
approval evidence, controlled UAT scope, security and operations signoff,
accepted UAT evidence, adapter allow-listing, secret audit persistence controls, release
documentation, and controlled hardware UAT evidence.
