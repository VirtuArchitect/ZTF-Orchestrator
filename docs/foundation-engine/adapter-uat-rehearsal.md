# Native Foundation Adapter UAT Rehearsal

Current release marker: `v1.8.1`.

The adapter UAT rehearsal plan turns the provider contract, deployment contract,
UAT checklist, preflight review, promotion review, and job state plan into one
scoped set of cases for controlled hardware testing.

This capability is read-only. It cannot run UAT, promote an adapter, call
Foundation, contact Prism Element, power-cycle hardware, image nodes, form
clusters, or run rollback actions.

## API

```text
POST /api/native-foundation/adapter-uat/rehearsal
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "providerId": "manual_static",
  "deploymentType": "hci"
}
```

When the intent contains exactly one provider and one deployment type, the API
can infer both values. Multi-provider or multi-topology intents should provide
explicit `providerId` and `deploymentType` values.

Valid intent returns `200` with a blocked read-only rehearsal plan. Invalid
intent returns `400`.

## Rehearsal Cases

The response includes:

- Operator UAT cases from the scoped UAT checklist.
- Provider adapter contract cases for discovery, power control, boot order,
  image mount or virtual media, and node imaging orchestration.
- Deployment topology contract cases for the selected deployment phases.
- Required evidence names merged from provider, deployment, and checklist
  requirements.
- Expected artifact names for notes, redacted logs, screenshots, request and
  response payloads, audit records, validation output, and rollback notes.

Every case is marked `canRun: false`, `readOnly: true`, and
`mutatingActionsEnabled: false`.

## Checks

The response checks:

- Provider contract selection.
- Deployment contract selection.
- UAT checklist availability.
- Provider preflight review.
- Job state plan review.
- Adapter promotion still blocked.
- The final UAT runner disablement block.

## Boundary

The rehearsal plan is a preparation artifact for controlled hardware UAT. It is
not execution evidence by itself and does not prove provider, imaging, cluster
formation, compute registration, storage-only, HCI, or mixed topology support.

Adapter UAT execution requires an approved lab scope, provider credentials,
hardware access, recovery runbooks, redacted evidence handling, audit retention,
and security review before this boundary can change.
