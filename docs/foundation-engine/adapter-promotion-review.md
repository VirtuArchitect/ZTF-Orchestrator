# Native Foundation Adapter Promotion Review

Current release marker: `v1.8.1`.

Adapter promotion review is a read-only control for deciding whether a native
Foundation provider and deployment type are ready to move toward controlled UAT.
It does not enable a mutating adapter and cannot promote software-only evidence
into deployment support.

## API

```text
POST /api/native-foundation/adapter-promotion/review
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>",
  "providerId": "manual_static",
  "deploymentType": "hci"
}
```

`providerId` and `deploymentType` are optional. When omitted, the review still
reports global blockers and matching evidence packs across the intent.

## Review Inputs

The review composes:

- Adapter contracts.
- Evidence packs.
- Execution readiness gates.
- Resume checkpoint state.
- Required promotion evidence.

Use [UAT Checklist](uat-checklist.md) to turn a scoped promotion review into
read-only test cases and evidence fields for controlled hardware validation.
Use [Review Packet](review-packet.md) to export the complete redacted review
bundle.

## Checks

| Check | Meaning |
|---|---|
| `matching-evidence-packs` | At least one cluster evidence pack matches the selected provider and deployment type. |
| `provider-contract-read-only` | The provider contract exists and remains non-mutating. |
| `deployment-contract-read-only` | The deployment contract exists and remains non-mutating. |
| `readiness-gates-accepted` | Current readiness gates have no blockers. |
| `checkpoint-clear` | Resume checkpoint has no failed or blocked graph steps. |
| `controlled-uat-required` | Hardware UAT is still required before mutating adapter promotion. |

## Boundary

The current result is always `status: blocked`, `canPromote: false`,
`readOnly: true`, and `mutatingActionsEnabled: false`. A future mutating adapter
promotion must name the exact provider, deployment type, hardware family,
Foundation/AOS/AHV versions, plan hash, evidence pack IDs, approval metadata,
and UAT results.
