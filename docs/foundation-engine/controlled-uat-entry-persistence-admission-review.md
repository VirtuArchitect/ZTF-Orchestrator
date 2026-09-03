# Native Foundation Controlled UAT Entry Persistence Admission Review

Current release marker: `v1.8.0`.

Controlled UAT entry persistence admission review declares the read-only
admission records that would be required before a controlled UAT entry could
ever be persisted for native Foundation deployment testing. It composes
controlled UAT entry issuance, controlled UAT signoff, controlled UAT runbook,
and UAT evidence acceptance reviews.

Provider operation queue admission provenance is carried from entry issuance
into every entry persistence admission record. That keeps future UAT entry
persistence tied to the exact provider operations that were cataloged,
reviewed, queued for planning, and blocked from queue admission.

This capability cannot admit entry persistence, persist UAT entry records,
issue UAT entry, start UAT, or start runners.

## API

```text
POST /api/native-foundation/uat/entry-persistence-admission-review
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

Valid intent returns `200` with a blocked read-only entry persistence admission
review. Invalid intent returns `400`.

## Admission Records

Each `entryPersistenceAdmissionRecords` item includes:

- Entry persistence admission record ID, entry issuance review ID, entry
  issuance record ID, reservation persistence admission record ID, UAT entry
  review ID, hardware reservation record ID, lane record ID, and binding
  record ID.
- Provider operation queue admission review ID, provider operation queue
  admission record IDs, provider operation queue item IDs, provider operation
  IDs, and zero admitted/persisted provider operation queue counts.
- Queue persistence admission IDs, authorization persistence admission IDs,
  carried authorization persistence IDs, carried authorization queue IDs,
  mutating enablement IDs, and controlled UAT completion gate summaries when
  available.
- Provider ID, deployment type, site names, cluster count, plan ID, intent
  hash, approval ID, and Validation Evidence ID.
- Deployment window reservation IDs, scheduler item IDs, lock request IDs,
  signoff review ID, runbook review ID, and UAT evidence acceptance review ID.
- `entryPersistenceAdmitted: false`.
- `entryPersisted: false`.
- `entryIssued: false`.
- `controlledUatStarted: false`.
- `runnerStarted: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Source reviews are linked.
- Controlled UAT entry issuance records are present.
- Provider operation queue admission provenance is bound to entry persistence
  admission.
- Approval and evidence gates are bound to entry persistence admission.
- Controlled UAT completion gates are bound to entry persistence admission.
- Entry persistence admission remains disabled.
- Controlled UAT start remains disabled.
- Native Foundation runner start remains disabled.

## Boundary

Controlled UAT entry persistence admission review cannot admit entry
persistence, persist UAT entry records, issue UAT entry, start controlled UAT,
start runners, open maintenance windows, execute adapters, call Foundation,
call Prism Element, contact BMCs, or mutate hardware.

Admitting entry persistence requires a future explicit change after entry
issuance, provider operation queue admission provenance, reservation
persistence admission, signoff, runbook, UAT evidence, approval/evidence
binding, and runner controls are implemented and UAT-proven.
