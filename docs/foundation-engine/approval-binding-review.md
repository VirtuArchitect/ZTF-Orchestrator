# Native Foundation Approval Binding Review

Current release marker: `v1.8.1`.

Approval binding review checks whether a native Foundation plan has a matching
approved workflow request and a captured Validation Evidence record with
controlled UAT completion gate metadata. It is a read-only governance check for
`native-foundation-deploy`; it does not start imaging, call hardware, create
clusters, or promote an adapter.

## API

```text
POST /api/native-foundation/approval-binding/review
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>",
  "approvalId": "<approval request id>",
  "evidenceId": "<validation evidence id>"
}
```

`approvalId` and `evidenceId` are optional for preview. When omitted, the
response reports the missing binding checks as blockers.

## Checks

The review returns these checks:

| Check | Purpose |
|---|---|
| `plan-valid` | Confirms the current intent still produces a valid native Foundation plan. |
| `approval-selected` | Confirms an approval request ID was supplied and found. |
| `approval-status-approved` | Confirms the approval is approved and unexpired. |
| `approval-workflow-native-foundation` | Confirms the approval workflow is `native-foundation-deploy`. |
| `approval-config-hash-match` | Confirms the approval binds to the current intent hash or plan metadata. |
| `evidence-selected` | Confirms a Validation Evidence record ID was supplied and found. |
| `evidence-source-native-foundation` | Confirms the evidence record is a native Foundation review packet. |
| `evidence-packet-plan-match` | Confirms packet ID, plan ID, intent hash, and contract version match the current intent. |
| `evidence-controlled-uat-completion-gate-reviewed` | Confirms the captured packet carries controlled UAT completion gate metadata. |
| `execution-still-disabled` | Always blocked in this release. |

## Boundary

A passing approval and matching evidence record are necessary for future
execution adapter promotion, but they are not sufficient to enable execution.
Mutating native Foundation adapters still require controlled hardware UAT,
updated support matrix entries, updated runbooks, and an explicit code change
that removes the read-only execution block for a specific provider and topology.
