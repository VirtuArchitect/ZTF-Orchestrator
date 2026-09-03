# Native Foundation Controlled UAT Start Readiness Review

Current release marker: `v1.8.0`.

Controlled UAT start readiness review declares the final read-only controls that
would be needed before a bounded native Foundation hardware UAT could start. It
composes controlled UAT entry issuance review records and carries their entry,
hardware reservation, lock, window, lane, and binding references forward into
start-readiness records. Provider operation queue admission provenance is
carried from entry persistence admission into each start-readiness record, so
the future start gate remains tied to the exact reviewed provider operations
without admitting queue execution.

This capability cannot start UAT, runners, adapters, or Foundation calls.

## API

```text
POST /api/native-foundation/uat/start-readiness-review
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

Valid intent returns `200` with a blocked read-only start readiness review.
Invalid intent returns `400`.

## Start Readiness Records

Each `startReadinessRecords` item includes:

- Start readiness record ID, entry issuance review ID, entry issuance record
  ID, UAT entry review ID, hardware reservation review ID, hardware reservation
  record ID, lane record ID, and binding record ID.
- Provider operation queue admission review ID, provider operation queue
  admission record IDs, provider operation queue item IDs, provider operation
  IDs, and zero admitted/persisted provider operation queue counts.
- Provider ID, deployment type, site names, cluster count, plan ID, and intent
  hash.
- Approval ID and Validation Evidence ID when supplied.
- Deployment window reservation IDs, scheduler item IDs, and lock request IDs.
- `controlledUatStarted: false`.
- `runnerStarted: false`.
- `adapterRuntimeAdmitted: false`.
- `adapterExecutionEnabled: false`.
- `foundationCallsEnabled: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Source reviews are linked.
- Controlled UAT entry issuance records are present.
- Controlled UAT entry persistence admission is reviewed.
- Provider operation queue admission provenance is bound to UAT start
  readiness.
- Approval and evidence gates are bound to UAT start readiness.
- Controlled UAT completion gates are bound to UAT start readiness.
- Controlled UAT start remains disabled.
- Native Foundation runner start remains disabled.
- Adapter execution remains disabled.

## Boundary

Controlled UAT start readiness review cannot start hardware UAT, open
maintenance windows, acquire locks, start runners, admit adapter runtimes,
execute adapters, call Foundation, call Prism Element, contact BMCs, persist
entry state, or mutate hardware.

Starting controlled UAT requires a future explicit change after entry issuance
persistence, maintenance window opening, lock acquisition, runner admission,
adapter execution enablement, Foundation call controls, and UAT runbook
approvals are implemented and UAT-proven.
