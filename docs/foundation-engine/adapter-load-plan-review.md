# Native Foundation Adapter Load Plan Review

Current release marker: `v1.8.0`.

Adapter load plan review converts adapter allow-list and controlled UAT signoff
artifacts into read-only load plan entries for future native Foundation
execution adapter loading. It carries retained-evidence export and secret-audit
persistence prerequisites plus packet output/export gate summaries from
controlled UAT signoff into every not-loaded adapter entry.
It also carries the controlled UAT completion requirement inherited from the
adapter allow-list review.

This capability cannot persist load plans, read adapter packages, import
adapter code, instantiate adapters, hand credentials to adapters, or start
runners.

## API

```text
POST /api/native-foundation/adapters/load-plan-review
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
  "loadPlanOwner": "adapter-owner",
  "loadPlanRef": "private-load-plan/LP-4001"
}
```

Valid intent returns `200` with a blocked read-only load plan review. Invalid
intent returns `400`.

## Load Plan Entries

Each `loadPlanEntries` item includes:

- Deterministic load-plan entry ID.
- Source allow-list and registry entry IDs.
- Provider and deployment type.
- Provider adapter ID.
- Site and cluster names.
- Controlled UAT completion requirement and current completion status.
- Required review artifact names.
- Required prerequisite artifacts.
- Source review status for controlled UAT signoff, retained evidence export,
  and secret audit persistence.
- Inherited adapter request packet gate counts, step audit event counts, adapter
  output evidence status, retained evidence export review status, and adapter
  command invocation status when `approvalId` and `evidenceId` bind to the same
  review packet.
- Blocked mutating operations.
- `canPersistLoadPlan: false`.
- `canLoadAdapter: false`.
- `canInstantiateAdapter: false`.
- `canStartRunner: false`.
- `mutatingActionsEnabled: false`.

The review ties load plan entries to adapter allow-list review, controlled UAT
completion review, controlled UAT signoff review, retained-evidence export
prerequisite, secret audit persistence review, packet output/export gate
summary, execution adapter contract review, provider adapters, and adapter
contracts.

## Metadata

The optional metadata fields are reviewed as text only:

- `loadPlanOwner`
- `loadPlanRef`

Supplying these values can clear the corresponding metadata checks, but load
plan persistence, adapter package access, adapter import, adapter
instantiation, credential handoff, and runner start remain blocked.

## Boundary

Adapter load plan review cannot persist load plans, read or verify adapter
packages, import modules, instantiate adapters, register runtime hooks, open
secret leases, hand credentials to adapters, start runners, call Foundation,
contact Prism Element, contact BMCs, export retained evidence, persist secret
audit entries, or mutate infrastructure.

A future adapter loading path must be an explicit enablement change with
private load-plan approval evidence, signed package provenance, controlled UAT
completion evidence, controlled UAT signoff, secret audit persistence controls,
secret handoff controls, operator runbooks, release documentation, and
controlled hardware UAT evidence.
