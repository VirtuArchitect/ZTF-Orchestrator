# Native Foundation Controlled UAT Entry Issuance Review

Current release marker: `v1.8.1`.

Controlled UAT entry issuance review assembles the future ticket that would
allow a bounded native Foundation lane to enter hardware UAT. It composes
controlled UAT entry, controlled UAT hardware reservation, controlled UAT
signoff, and UAT evidence acceptance reviews.
Provider operation queue admission provenance is carried from reservation
persistence admission into every entry issuance record, keeping the future UAT
entry tied to the exact reviewed provider operations while queue admission and
execution remain disabled.

This capability cannot persist or issue UAT entry.

## API

```text
POST /api/native-foundation/uat/entry-issuance-review
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

Valid intent returns `200` with a blocked read-only entry issuance review.
Invalid intent returns `400`.

## Issuance Records

Each `entryIssuanceRecords` item includes:

- Entry issuance record ID, UAT entry review ID, hardware reservation review
  ID, hardware reservation record ID, lane record ID, and binding record ID.
- Provider operation queue admission review ID, provider operation queue
  admission record IDs, provider operation queue item IDs, provider operation
  IDs, and zero admitted/persisted provider operation queue counts.
- Provider ID, deployment type, site names, cluster count, plan ID, and intent
  hash.
- Approval ID and Validation Evidence ID when supplied.
- Deployment window reservation IDs, scheduler item IDs, and lock request IDs.
- Controlled UAT signoff review ID and UAT evidence acceptance review ID.
- Required and accepted UAT evidence counts.
- `entryPersisted: false`.
- `entryIssued: false`.
- `controlledUatStarted: false`.
- `adapterExecutionEnabled: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Source reviews are linked.
- Controlled UAT entry review is present.
- Controlled UAT hardware reservation records are present.
- Controlled UAT reservation persistence admission is reviewed.
- Controlled UAT signoff review is present.
- Provider operation queue admission provenance is bound to entry issuance.
- Approval and evidence gates are bound to entry issuance.
- Controlled UAT completion gates are bound to entry issuance.
- UAT entry persistence remains disabled.
- UAT entry issuance remains disabled.
- Adapter execution remains disabled.

## Boundary

Controlled UAT entry issuance review cannot persist entry records, issue UAT
entry, start hardware testing, open maintenance windows, load or execute
adapters, start runners, open target connections, call Foundation, call Prism
Element, contact BMCs, or mutate hardware.

Persisting and issuing controlled UAT entry requires a future explicit change
after entry review, hardware reservation persistence, maintenance window
opening, signoff persistence, UAT evidence acceptance, runner admission, and
adapter enablement are implemented and UAT-proven.
