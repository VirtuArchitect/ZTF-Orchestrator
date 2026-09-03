# Native Foundation Controlled UAT Runner Admission Review

Current release marker: `v1.8.0`.

Controlled UAT runner admission review declares the read-only controls that
would be needed before a native Foundation runner could be admitted for bounded
hardware UAT. It composes controlled UAT start readiness, adapter runtime
admission, adapter runtime isolation, and runner readiness reviews into future
runner-admission records.
Provider operation queue admission provenance is carried from start persistence
admission into every runner-admission record, so future runner admission
remains tied to the exact reviewed provider operations without admitting or
executing them.

This capability cannot admit runtimes, persist admission state, start runners,
execute adapters, or call Foundation.

## API

```text
POST /api/native-foundation/uat/runner-admission-review
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

Valid intent returns `200` with a blocked read-only runner admission review.
Invalid intent returns `400`.

## Runner Admission Records

Each `runnerAdmissionRecords` item includes:

- Runner admission record ID, start readiness review ID, start readiness record
  ID, entry issuance record ID, runtime admission review ID, runtime admission
  entry ID, runtime isolation review ID, runtime isolation entry ID, runner
  readiness ID, and runner readiness item ID.
- Provider operation queue admission review ID, provider operation queue
  admission record IDs, provider operation queue item IDs, provider operation
  IDs, and zero admitted/persisted provider operation queue counts.
- Provider ID, deployment type, site names, cluster count, plan ID, and intent
  hash.
- Approval ID and Validation Evidence ID when supplied.
- Deployment window reservation IDs, scheduler item IDs, and lock request IDs.
- `runnerAdmissionPersisted: false`.
- `runnerAdmitted: false`.
- `runnerStarted: false`.
- `runtimeAdmitted: false`.
- `adapterExecutionEnabled: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Source reviews are linked.
- Controlled UAT start readiness records are present.
- Adapter runtime admission review is linked.
- Native Foundation runner readiness review is linked.
- Provider operation queue admission provenance is bound to runner admission.
- Approval and evidence gates are bound to runner admission.
- Controlled UAT completion gates are bound to runner admission.
- Runner admission persistence remains disabled.
- Native Foundation runner start remains disabled.
- Adapter execution remains disabled.

## Boundary

Controlled UAT runner admission review cannot admit runners, admit adapter
runtimes, start workers, open network sockets, execute adapters, call
Foundation, call Prism Element, contact BMCs, persist admission state, or mutate
hardware.

Admitting native Foundation runners requires a future explicit change after UAT
start controls, runtime admission, runner readiness, adapter execution
enablement, persistence, audit, rollback, and release documentation are
implemented and UAT-proven.
