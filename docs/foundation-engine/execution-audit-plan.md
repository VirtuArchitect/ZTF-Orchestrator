# Native Foundation Execution Audit Plan

Current release marker: `v1.8.0`.

Execution audit plan review declares the audit events and retained artifacts a
future native Foundation run would need before adapter execution, recovery, and
operator evidence export can be enabled. It also declares audit coverage for
retained evidence export, secret audit persistence prerequisites, and adapter
packet output/export gate summaries.

This capability cannot persist audit events or retained evidence.

## API

```text
POST /api/native-foundation/execution/audit-plan
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "phase": "full_deployment",
  "approvalId": "<optional approval id>",
  "evidenceId": "<optional validation evidence id>"
}
```

Valid intent returns `200` with a blocked read-only audit plan. Invalid intent
returns `400`.

When `approvalId` and `evidenceId` identify the same reviewed native Foundation
package, the audit plan carries the execution permit packet gate summary into
the planned event stream. Without that binding, the packet summary remains
declared but empty and the packet summary check stays blocked.

## Audit Events

Each `auditEvents` item includes:

- Deterministic event ID.
- Event sequence.
- Event type.
- Plan ID and intent SHA256.
- Source artifact and source ID.
- Retention target.
- Evidence target.
- `persisted: false`.
- `mutatingActionsEnabled: false`.

The event stream declares permit review, lock declaration, execution request
review, dry-run ledger review, adapter packet output/export gate review,
adapter-step block, recovery review, job-state review, retained evidence export
prerequisite review, secret audit persistence review, and one step-recorded
event per dry-run ledger entry. Step-recorded events include
`packetGateSummary` only when a matching approval/evidence packet binds the
adapter output evidence, retained export, and command invocation reviews.

## Retention Artifacts

The response declares these retained artifact targets without writing them:

- `audit-log.jsonl`
- `redacted-execution-evidence.zip`
- `dry-run-ledger.json`
- `execution-permit-review.json`
- `execution-lock-plan.json`
- `job-state-plan.json`
- `recovery-plan.json`
- `retained-evidence-export-review.json`
- `secret-audit-persistence-review.json`
- `SHA256SUMS`

Every artifact is marked `persisted: false` and `redacted: true`.

## Checks

The response checks:

- Execution permit artifact availability.
- Execution lock plan artifact availability.
- Dry-run ledger artifact availability.
- Job-state artifact availability.
- Retained evidence export prerequisite declaration.
- Secret audit persistence prerequisite status.
- Packet output/export gate summary review.
- Audit event declaration.
- Retention artifact declaration.
- The final audit-persistence disablement block.

## Boundary

Execution audit plan review cannot append audit events, write retained
artifacts, export evidence ZIPs, write hash manifests, submit jobs, run
adapters, call Foundation, call Prism Element, resolve secrets, persist secret
audit entries, or mutate hardware.

Audit persistence can only be enabled after storage schema, retention policy,
redaction, RBAC export, backup/restore, adapter execution, recovery behavior,
and controlled hardware UAT pass in the same change set.
