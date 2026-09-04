# Native Foundation Controlled UAT Lane Selection Review

Current release marker: `v1.8.1`.

Controlled UAT lane selection review declares the bounded provider,
deployment-type, site, and adapter-binding lane that a future first mutating
native Foundation adapter would have to use. It composes mutating adapter
binding, deployment type support, controlled UAT scope, controlled UAT signoff,
and UAT evidence acceptance reviews. The mutating adapter binding source also
carries provider operation queue admission provenance into each lane record, so
future lane selection can be traced back to the exact read-only provider
operation queue admission records without admitting or persisting the queue.

This capability cannot select or authorize a UAT lane.

## API

```text
POST /api/native-foundation/uat/lane-selection-review
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

Valid intent returns `200` with a blocked read-only lane selection review.
Invalid intent returns `400`.

When the intent contains exactly one provider and deployment type, the review
infers them. Otherwise, pass `providerId` and `deploymentType` explicitly.

## Lane Records

Each `laneRecords` item includes:

- Lane record ID, binding record ID, queue record ID, submission record ID, and
  scope record ID when available.
- Provider operation queue admission review ID, provider operation queue
  admission record IDs, provider operation queue item IDs, provider operation
  IDs, and zero admitted/persisted provider operation queue counts.
- Provider ID, deployment type, site names, cluster count, adapter contract
  version, plan ID, and intent hash.
- Approval ID and Validation Evidence ID when supplied.
- Required and accepted UAT evidence counts.
- `selectedForControlledUat: false`.
- `selectionPersisted: false`.
- `hardwareReserved: false`.
- `uatEntryIssued: false`.
- `adapterBindingPersisted: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Source reviews are linked.
- One provider contract is selected.
- One deployment contract is selected.
- Controlled UAT lane records are declared.
- Provider operation queue admission provenance is bound to lane selection.
- Approval and evidence gates are bound to lane selection.
- Controlled UAT completion gates are bound to lane selection.
- Lane selection persistence remains disabled.
- UAT entry issuance remains disabled.

## Boundary

Controlled UAT lane selection review cannot persist selections, reserve
hardware, issue UAT entry, persist adapter bindings, load adapters, execute
adapters, call Foundation, call Prism Element, or mutate hardware.

Persisting a controlled UAT lane requires a future explicit change after a
maintainer selects one provider/deployment/site lane, validates hardware scope,
binds approval/evidence, documents rollback, and explicitly enables the bounded
adapter path.
