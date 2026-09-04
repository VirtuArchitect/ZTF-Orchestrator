# Native Foundation Controlled UAT Lane Persistence Admission Review

Current release marker: `v1.8.1`.

Controlled UAT lane persistence admission review declares the read-only
admission records that would be required before a selected controlled UAT lane
could ever be persisted for native Foundation deployment testing. It composes
controlled UAT lane selection, job persistence admission, mutating adapter
binding, and controlled UAT scope reviews.

The review carries provider operation queue admission provenance from lane
selection into every lane persistence admission record. This preserves the
chain from provider operation catalog, provider operation admission, provider
operation queue plan, and provider operation queue admission through to the
future lane persistence gate without enqueueing, persisting, admitting, or
executing provider operations.

This capability cannot admit lane persistence or authorize hardware
reservation.

## API

```text
POST /api/native-foundation/uat/lane-persistence-admission-review
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

Valid intent returns `200` with a blocked read-only lane persistence admission
review. Invalid intent returns `400`.

## Admission Records

Each `lanePersistenceAdmissionRecords` item includes:

- Lane persistence admission record ID, lane record ID, binding record ID,
  queue record ID, queue persistence admission IDs, job persistence admission
  IDs, and scope record ID when available.
- Provider operation queue admission review ID, provider operation queue
  admission record IDs, provider operation queue item IDs, provider operation
  IDs, and zero admitted/persisted provider operation queue counts.
- Authorization persistence admission IDs, carried authorization persistence
  IDs, carried authorization queue IDs, mutating enablement IDs, and controlled
  UAT completion gate summaries when available.
- Provider ID, deployment type, site names, cluster count, plan ID, intent
  hash, approval ID, and Validation Evidence ID.
- `lanePersistenceAdmitted: false`.
- `laneSelectionPersisted: false`.
- `hardwareReservationAdmitted: false`.
- `hardwareReserved: false`.
- `uatEntryIssued: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Source reviews are linked.
- Controlled UAT lane records are present.
- Job persistence admission review is linked.
- Mutating adapter binding review is linked.
- Provider operation queue admission provenance is bound to lane persistence
  admission.
- Approval and evidence gates are bound to lane persistence admission.
- Controlled UAT completion gates are bound to lane persistence admission.
- Lane persistence remains disabled.
- Hardware reservation admission remains disabled.
- UAT entry issuance remains disabled.

## Boundary

Controlled UAT lane persistence admission review cannot persist lane
selections, persist adapter bindings, admit hardware reservation, reserve
hardware, open maintenance windows, issue UAT entry, call Foundation, call
Prism Element, contact BMCs, or mutate hardware.

Admitting controlled UAT lane persistence requires a future explicit change
after lane selection, provider operation queue admission provenance, job
persistence admission, adapter binding, scope, approval/evidence binding,
rollback ownership, and controlled hardware UAT readiness are implemented and
UAT-proven.
