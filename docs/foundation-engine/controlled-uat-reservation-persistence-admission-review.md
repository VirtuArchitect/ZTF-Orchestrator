# Native Foundation Controlled UAT Reservation Persistence Admission Review

Current release marker: `v1.8.1`.

Controlled UAT reservation persistence admission review declares the read-only
admission records that would be required before hardware reservation state
could ever be persisted for native Foundation deployment testing. It composes
controlled UAT hardware reservation, controlled UAT signoff, controlled UAT
operations, and UAT evidence acceptance reviews.

Provider operation queue admission provenance is carried from hardware
reservation into every reservation persistence admission record. That keeps the
future persistence gate tied to the exact provider operations that were
cataloged, reviewed, planned for queue placement, and blocked from admission.

This capability cannot admit or persist hardware reservations.

## API

```text
POST /api/native-foundation/uat/reservation-persistence-admission-review
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

Valid intent returns `200` with a blocked read-only reservation persistence
admission review. Invalid intent returns `400`.

## Admission Records

Each `reservationPersistenceAdmissionRecords` item includes:

- Reservation persistence admission record ID, hardware reservation review ID,
  hardware reservation record ID, lane record ID, lane persistence admission
  record ID, binding record ID, queue record ID, and queue persistence
  admission IDs.
- Provider operation queue admission review ID, provider operation queue
  admission record IDs, provider operation queue item IDs, provider operation
  IDs, and zero admitted/persisted provider operation queue counts.
- Authorization persistence admission IDs, carried authorization persistence
  IDs, carried authorization queue IDs, mutating enablement IDs, and controlled
  UAT completion gate summaries when available.
- Provider ID, deployment type, site names, cluster count, plan ID, intent
  hash, approval ID, and Validation Evidence ID.
- Deployment window reservation IDs, scheduler item IDs, lock request IDs, and
  controlled UAT operations item IDs.
- `reservationPersistenceAdmitted: false`.
- `hardwareReservationPersisted: false`.
- `maintenanceWindowOpened: false`.
- `hardwareReserved: false`.
- `uatEntryIssued: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Source reviews are linked.
- Controlled UAT hardware reservation records are present.
- Controlled UAT signoff review is present.
- Controlled UAT operations review is present.
- Provider operation queue admission provenance is bound to reservation
  persistence admission.
- Approval and evidence gates are bound to reservation persistence admission.
- Controlled UAT completion gates are bound to reservation persistence
  admission.
- Reservation persistence admission remains disabled.
- Maintenance window opening remains disabled.
- UAT entry issuance remains disabled.

## Boundary

Controlled UAT reservation persistence admission review cannot admit
reservation persistence, persist hardware reservations, open maintenance
windows, acquire locks, reserve hardware, issue UAT entry, call Foundation,
call Prism Element, contact BMCs, or mutate hardware.

Admitting reservation persistence requires a future explicit change after
hardware reservation, provider operation queue admission provenance, signoff,
operations controls, approval/evidence binding, maintenance-window ownership,
and adapter enablement are implemented and UAT-proven.
