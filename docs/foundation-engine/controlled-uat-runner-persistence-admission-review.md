# Native Foundation Controlled UAT Runner Persistence Admission Review

Current release marker: `v1.8.0`.

Controlled UAT runner persistence admission review declares the read-only
admission records that would be required before runner admission state could
ever be persisted for native Foundation deployment testing. It composes
controlled UAT runner admission and controlled UAT start persistence admission
reviews.

Provider operation queue admission provenance is carried from runner admission
into every runner persistence admission record. This keeps the future runner
persistence gate tied to the exact provider operations that were cataloged,
reviewed, planned for queue placement, and blocked from queue admission.

This capability cannot admit runner persistence, persist runner admission
state, admit runners, start runners, admit runtimes, execute adapters, or call
Foundation.

## API

```text
POST /api/native-foundation/uat/runner-persistence-admission-review
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

Valid intent returns `200` with a blocked read-only runner persistence
admission review. Invalid intent returns `400`.

## Admission Records

Each `runnerPersistenceAdmissionRecords` item includes:

- Runner persistence admission record ID, runner admission review ID, runner
  admission record ID, start persistence admission IDs, start readiness IDs,
  and entry issuance record ID.
- Provider operation queue admission review ID, provider operation queue
  admission record IDs, provider operation queue item IDs, provider operation
  IDs, and zero admitted/persisted provider operation queue counts.
- Queue persistence admission IDs, authorization persistence admission IDs,
  carried authorization persistence IDs, carried authorization queue IDs,
  mutating enablement IDs, and controlled UAT completion gate summaries when
  available.
- Runtime admission IDs, runtime isolation IDs, runner readiness IDs, provider
  ID, deployment type, site names, cluster count, plan ID, intent hash,
  approval ID, and Validation Evidence ID.
- Deployment window reservation IDs, scheduler item IDs, and lock request IDs.
- `runnerPersistenceAdmitted: false`.
- `runnerAdmissionPersisted: false`.
- `runnerAdmitted: false`.
- `runnerStarted: false`.
- `runtimeAdmitted: false`.
- `adapterExecutionEnabled: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Source reviews are linked.
- Controlled UAT runner admission records are present.
- Provider operation queue admission provenance is bound to runner persistence
  admission.
- Approval and evidence gates are bound to runner persistence admission.
- Controlled UAT completion gates are bound to runner persistence admission.
- Runner persistence admission remains disabled.
- Runner admission persistence remains disabled.
- Native Foundation runner start remains disabled.
- Adapter execution remains disabled.

## Boundary

Controlled UAT runner persistence admission review cannot admit runner
persistence, persist runner admission state, admit runners, admit adapter
runtimes, start workers, open network sockets, execute adapters, call
Foundation, call Prism Element, contact BMCs, or mutate hardware.

Admitting runner persistence requires a future explicit change after runner
admission, start persistence, runtime admission, runner readiness, audit
persistence, rollback, and release documentation are implemented and UAT-proven.
