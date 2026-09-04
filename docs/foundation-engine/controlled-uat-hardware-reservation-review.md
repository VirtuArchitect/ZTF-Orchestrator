# Native Foundation Controlled UAT Hardware Reservation Review

Current release marker: `v1.8.1`.

Controlled UAT hardware reservation review declares the hardware, deployment
window, scheduler, lock, and operations controls that a future bounded native
Foundation UAT lane would need before any hardware testing starts. It composes
controlled UAT lane selection, deployment window reservation, deployment
scheduler, execution lock plan, and controlled UAT operations reviews.
Provider operation queue admission provenance is carried forward from lane
persistence admission into every reservation record, keeping future hardware
reservation tied to the exact provider operations that were reviewed but not
admitted.

This capability cannot reserve hardware or open a maintenance window.

## API

```text
POST /api/native-foundation/uat/hardware-reservation-review
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

Valid intent returns `200` with a blocked read-only hardware reservation
review. Invalid intent returns `400`.

## Reservation Records

Each `reservationRecords` item includes:

- Hardware reservation record ID, lane record ID, binding record ID, queue
  record ID, and submission record ID when available.
- Provider operation queue admission review ID, provider operation queue
  admission record IDs, provider operation queue item IDs, provider operation
  IDs, and zero admitted/persisted provider operation queue counts.
- Provider ID, deployment type, site names, cluster count, plan ID, and intent
  hash.
- Approval ID and Validation Evidence ID when supplied.
- Deployment window reservation IDs, scheduler item IDs, execution lock request
  IDs, and controlled UAT operations item IDs.
- Window status and a null maintenance window reference.
- `hardwareReservationPersisted: false`.
- `maintenanceWindowOpened: false`.
- `hardwareReserved: false`.
- `uatEntryIssued: false`.
- `adapterExecutionEnabled: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Source reviews are linked.
- Controlled UAT lane records are declared.
- Controlled UAT lane persistence admission is reviewed.
- Provider operation queue admission provenance is bound to hardware
  reservation.
- Deployment window reservations are reviewed.
- Execution lock plan is reviewed.
- Approval and evidence gates are bound to hardware reservation.
- Controlled UAT completion gates are bound to hardware reservation.
- Hardware reservation persistence remains disabled.
- Maintenance window opening remains disabled.
- UAT entry issuance remains disabled.

## Boundary

Controlled UAT hardware reservation review cannot persist reservations, allocate
nodes, open maintenance windows, acquire locks, start waves, enqueue jobs, issue
UAT entry, load or execute adapters, call Foundation, call Prism Element, or
mutate hardware.

Persisting controlled UAT hardware reservations requires a future explicit
change after lane selection, deployment window ownership, lock acquisition,
operations signoff, approval/evidence binding, and maintainer-controlled adapter
enablement are implemented and UAT-proven.
