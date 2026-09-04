# Native Foundation Mutating Enablement Review

Current release marker: `v1.8.1`.

Mutating enablement review is the final read-only gate before any future native
Foundation deployment path could be explicitly enabled. It composes runner
readiness, backup/restore review, controlled UAT signoff, adapter runtime
admission, execution preflight, target connectivity, credential handoff,
command invocation, output evidence, and retained evidence export reviews into
one disabled enablement record.

This capability cannot enable deployment execution.

## API

```text
POST /api/native-foundation/execution/mutating-enablement-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "phase": "full_deployment",
  "providerId": "<optional provider id>",
  "deploymentType": "<optional deployment type>",
  "approvalId": "<optional approval id>",
  "evidenceId": "<optional validation evidence id>"
}
```

Valid intent returns `200` with a blocked read-only mutating enablement review.
Invalid intent returns `400`.

When `approvalId` and `evidenceId` identify the same reviewed native Foundation
package, the review inherits packet output/export gate summary counts from the
adapter output evidence and retained export path. Without that binding, the
packet summary check remains blocked.

## Enablement Items

Each `enablementItems` item includes:

- Item ID and label.
- Source artifact and source ID.
- Source review status.
- Whether the item is required for mutating execution.
- `mutatingActionsEnabled: false`.

The source review set covers:

- Runner readiness.
- Backup/restore readiness.
- Controlled UAT signoff.
- Adapter runtime admission.
- Adapter execution preflight.
- Target connectivity.
- Credential handoff.
- Adapter command invocation.
- Adapter output evidence.
- Retained evidence export.

The review then blocks the actual transition points: controlled UAT entry
issuance, runtime admission, target access, credential handoff, command
invocation, runner start, and mutating job submission.

## Checks

The response checks:

- Source reviews are linked.
- Packet output/export gate summaries are available.
- Controlled UAT entry issuance remains disabled.
- Adapter runtime start remains disabled.
- Target access remains disabled.
- Mutating native Foundation job submission remains disabled.

## Boundary

Mutating enablement review cannot issue controlled UAT entry, persist signoff,
admit runtimes, create sandboxes, open target connections, resolve secrets,
handoff credentials, assemble command files, invoke adapters, capture live
output, export retained evidence, start runners, enqueue deployment jobs, call
Foundation, call Prism Element, or mutate hardware.

Enabling mutating native Foundation execution requires a future explicit change
with persisted approvals, controlled UAT entry issuance, admitted adapter
runtime, scoped target connectivity, audited credential handoff, command
invocation, output evidence capture, retained evidence export, backup/restore
proof, runner start controls, release documentation, and controlled hardware
UAT evidence.
