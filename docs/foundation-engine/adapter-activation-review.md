# Native Foundation Adapter Activation Review

Current release marker: `v1.8.0`.

The adapter activation review is the final read-only gate before any future
native Foundation adapter could be considered for mutating execution. It
combines provider and deployment contract selection, adapter UAT rehearsal,
required UAT evidence references, approval binding, validation evidence, and
promotion review state. It also requires controlled UAT completion evidence
before adapter activation can be considered.

This capability cannot activate an adapter.

## API

```text
POST /api/native-foundation/adapter-activation/review
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "providerId": "manual_static",
  "deploymentType": "hci",
  "approvalId": "<optional approval id>",
  "evidenceId": "<optional validation evidence id>"
}
```

When the intent contains exactly one provider and one deployment type, the API
can infer both values. Provide `approvalId` and `evidenceId` to prove the
approved request and captured native Foundation review packet bind to the same
plan.

Valid intent returns `200` with a blocked read-only activation review. Invalid
intent returns `400`.

## Activation Request

The response includes a deterministic `activationRequest` with:

- Request ID.
- Provider ID and deployment type.
- Adapter contract version.
- UAT rehearsal ID and checklist ID.
- `requiresControlledUatCompletion: true`.
- Approval and evidence IDs when supplied.
- Required and accepted evidence counts.
- Current provider/deployment status.
- `targetStatusAfterActivation: not_enabled`.
- `activationMode: review_only`.
- `submitted: false`.
- `canActivateAdapter: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Provider contract selection.
- Deployment contract selection.
- Adapter UAT rehearsal review.
- Required UAT evidence acceptance.
- Approval and validation evidence binding.
- Promotion review readiness apart from the controlled-UAT block.
- Controlled UAT completion requirement.
- The final adapter activation disablement block.

## Boundary

Adapter activation review cannot change the provider registry, enable mutation,
load adapter code, resolve secrets, submit deployment jobs, call Foundation,
call Prism Element, run UAT, or mutate hardware.

A passing activation review package is necessary but not sufficient to enable
execution. Enabling a mutating adapter still requires controlled UAT completion,
controlled hardware UAT evidence, security review, runbooks, release
documentation, and an explicit implementation that changes the adapter registry
and execution switch.
