# Native Foundation Controlled UAT Start Persistence Admission Review

Current release marker: `v1.8.0`.

Controlled UAT start persistence admission review declares the read-only
admission records that would be required before controlled UAT start state
could ever be persisted for native Foundation deployment testing. It composes
controlled UAT start readiness and controlled UAT entry persistence admission
reviews.

Provider operation queue admission provenance is carried from start readiness
into every start persistence admission record. This keeps the future start
persistence gate tied to the exact provider operations that were cataloged,
reviewed, planned for queue placement, and blocked from queue admission.

This capability cannot admit start persistence, persist controlled UAT start
state, start hardware UAT, start runners, execute adapters, or call Foundation.

## API

```text
POST /api/native-foundation/uat/start-persistence-admission-review
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

Valid intent returns `200` with a blocked read-only start persistence admission
review. Invalid intent returns `400`.

## Admission Records

Each `startPersistenceAdmissionRecords` item includes:

- Start persistence admission record ID, start readiness review ID, start
  readiness record ID, entry issuance IDs, entry persistence admission IDs,
  UAT entry ID, hardware reservation IDs, lane record ID, and binding record ID.
- Provider operation queue admission review ID, provider operation queue
  admission record IDs, provider operation queue item IDs, provider operation
  IDs, and zero admitted/persisted provider operation queue counts.
- Queue persistence admission IDs, authorization persistence admission IDs,
  carried authorization persistence IDs, carried authorization queue IDs,
  mutating enablement IDs, and controlled UAT completion gate summaries when
  available.
- Provider ID, deployment type, site names, cluster count, plan ID, intent
  hash, approval ID, and Validation Evidence ID.
- Deployment window reservation IDs, scheduler item IDs, and lock request IDs.
- `startPersistenceAdmitted: false`.
- `controlledUatStartPersisted: false`.
- `controlledUatStarted: false`.
- `runnerStarted: false`.
- `adapterExecutionEnabled: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Source reviews are linked.
- Controlled UAT start readiness records are present.
- Provider operation queue admission provenance is bound to UAT start
  persistence admission.
- Approval and evidence gates are bound to UAT start persistence admission.
- Controlled UAT completion gates are bound to UAT start persistence admission.
- Start persistence admission remains disabled.
- Controlled UAT start remains disabled.
- Native Foundation runner start remains disabled.
- Adapter execution remains disabled.

## Boundary

Controlled UAT start persistence admission review cannot admit start
persistence, persist controlled UAT start state, start hardware UAT, open
sessions, start runners, execute adapters, call Foundation, call Prism Element,
contact BMCs, or mutate hardware.

Admitting start persistence requires a future explicit change after start
readiness, provider operation queue admission provenance, entry persistence,
maintenance window opening, lock acquisition, runner admission, adapter
execution enablement, and audit persistence are implemented and UAT-proven.
