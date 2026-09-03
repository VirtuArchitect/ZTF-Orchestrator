# Native Foundation Mutating Adapter Binding Review

Current release marker: `v1.8.0`.

Mutating adapter binding review declares the exact adapter binding records that
a future controlled native Foundation execution path would need before any
mutating adapter could be used. It binds queue persistence, adapter activation,
provider operation queue admission, adapter allow-list, runtime admission,
execution preflight, target connectivity, credential handoff, plan hashes,
approval metadata, and UAT evidence metadata.

This capability cannot bind, load, or execute adapters.

## API

```text
POST /api/native-foundation/execution/mutating-adapter-binding-review
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

Valid intent returns `200` with a blocked read-only binding review. Invalid
intent returns `400`.

When the intent contains exactly one provider and deployment type, the review
infers them. Otherwise, pass `providerId` and `deploymentType` explicitly.

## Binding Records

Each `bindingRecords` item includes:

- Binding record ID, queue record ID, provider operation queue admission IDs,
  submission record ID, and job state ID.
- Provider ID, deployment type, adapter contract version, plan ID, intent hash,
  and discovery hash.
- Approval ID and Validation Evidence ID when supplied.
- Activation, allow-list, runtime admission, preflight, target connectivity,
  and credential handoff review IDs.
- Required and accepted UAT evidence counts from adapter activation review.
- Provider and deployment contract status.
- `bindingPersisted: false`.
- `adapterLoaded: false`.
- `runtimeAdmitted: false`.
- `credentialsHandedOff: false`.
- `targetConnectionsOpened: false`.
- `adapterExecuted: false`.
- `jobSubmitted: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Source reviews are linked.
- Provider operation queue admission provenance is linked.
- Provider and deployment contracts are selected.
- Plan hash is bound to adapter binding records.
- Approval and evidence gates are bound to adapter binding.
- Binding records are declared.
- Adapter binding persistence remains disabled.
- Adapter load and execution remain disabled.

## Boundary

Mutating adapter binding review cannot persist adapter binding records, update
the adapter registry, read or load adapter packages, admit runtimes, open target
connections, resolve or hand off credentials, submit jobs, invoke adapter
commands, call Foundation, call Prism Element, or mutate hardware.

Persisting mutating adapter bindings requires a future explicit change after
provider operation queue admission, queue persistence, adapter activation,
allow-listing, runtime admission, execution preflight, target connectivity,
credential handoff, approval/evidence binding, and controlled hardware UAT pass.
