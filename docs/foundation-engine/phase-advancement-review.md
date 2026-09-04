# Native Foundation Phase Advancement Review

Current release marker: `v1.8.1`.

`POST /api/native-foundation/phases/advancement-review` reviews whether a
native Foundation rollout phase can be promoted toward execution. In this
release the review is read-only and fail-closed: it never promotes phases,
enables adapters, submits jobs, calls Foundation, calls Prism Element, resolves
secrets, opens maintenance windows, or mutates hardware.

## Request

In the workflow detail UI, choose an Advancement Phase in the Native Foundation
Phase Status panel and select Review. The UI sends the same read-only request
shape shown below.

```json
{
  "phaseId": "production_hardening",
  "content": "ztf_orchestrator:\n  workflow: native_foundation\n..."
}
```

`phaseId` must match an ID from
[`GET /api/native-foundation/phases`](phase-catalog.md). `content` must be a
valid native Foundation deployment intent.

## Response

Valid intent returns `200` with `status: blocked`, `readOnly: true`, and
`mutatingActionsEnabled: false`.

The response includes:

- Requested phase metadata from the phase catalog.
- Plan ID, intent hash, and discovery hash for the reviewed intent.
- `phaseEvidenceRequirements`, with one record per requested phase evidence
  key, using the same `accepted: true` plus `evidence_id` rule as execution
  readiness.
- Checks for known phase, plan validity, predecessor phase implementation,
  documentation binding, phase evidence acceptance, controlled-UAT completion,
  and mutating enablement.
- Summary counts for required, accepted, and missing phase evidence records.
- Required actions for future controlled-UAT promotion.

Unknown phases or invalid intents return `400`. Unknown phases include the
supported phase IDs. Invalid intents return the same read-only review shape with
`plan-valid: fail` so the operator can correct the deployment intent before
rechecking promotion readiness.

## Promotion Boundary

Phase advancement cannot be used as an execution override. A future release
that enables any phase must update:

- Backend phase catalog and execution adapter controls.
- Support matrix and roadmap.
- User guide and validation status.
- Release-integrity and API tests.
- Controlled UAT evidence and retained review artifacts.
