# Native Foundation Adapter Enablement Review

Current release marker: `v1.8.0`.

Adapter enablement review produces the disabled registry draft that a future
native Foundation adapter enablement change would have to update after
controlled hardware UAT and controlled UAT completion evidence. It is designed
for multi-site plans where a single intent can contain several provider and
deployment-type combinations.

This capability cannot enable an adapter.

## API

```text
POST /api/native-foundation/adapter-enablements/review
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "providerId": "<optional provider scope>",
  "deploymentType": "<optional deployment type scope>",
  "approvalId": "<optional approval id>",
  "evidenceId": "<optional validation evidence id>"
}
```

When `providerId` and `deploymentType` are omitted, the API creates one
registry draft entry for every provider/deployment pair in the reviewed native
Foundation intent. Supplying either value filters the draft to that scope.

Valid intent returns `200` with a blocked read-only enablement review. Invalid
intent returns `400`.

## Registry Draft

Each `registryDraft` entry includes:

- Registry key and deterministic registry entry ID.
- Provider ID and deployment type.
- Site names, cluster names, and node count covered by the entry.
- Current provider and deployment contract status.
- Activation request ID from adapter activation review.
- Controlled UAT completion requirement and current completion status.
- Required evidence and evidence status records.
- Allowed read-only phases and planned deployment phases.
- Blocked mutating provider operations.
- Safeguards that must be satisfied before any future enablement change.
- `enabled: false`.
- `canLoadAdapter: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Native Foundation plan validity.
- Matching registry scope.
- Activation review linkage for every registry entry.
- Controlled UAT completion requirement for every registry entry.
- Every registry draft entry remains disabled.
- The final adapter registry mutation disablement block.

## Boundary

Adapter enablement review cannot persist registry changes, load adapter code,
resolve secrets, start jobs, run UAT, call Foundation, call Prism Element, or
mutate hardware.

The registry draft is an approval and UAT artifact only. Moving a provider or
deployment type from planned/read-only to enabled still requires controlled
hardware UAT, controlled UAT completion evidence, matching approvals and
Validation Evidence, security review, release documentation, and operator
runbooks in the same change set.
