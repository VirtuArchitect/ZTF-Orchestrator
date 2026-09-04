# Native Foundation Provider Operation Catalog

Current release marker: `v1.8.1`.

`POST /api/native-foundation/provider-operation-catalog` expands a valid
`native-foundation-deploy` intent into a read-only operation catalog for every
planned site and cluster. It combines the provider adapter scaffold,
provider/topology matrix, deployment type, node role summary, and accepted UAT
evidence metadata into one operator-review artifact.

The catalog answers: if this cluster were allowed to run in a future controlled
UAT lane, which provider and deployment operations would be required, and which
ones are still blocked?

## API

```text
POST /api/native-foundation/provider-operation-catalog
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>"
}
```

Valid intent returns `200` with `status: blocked`, `readOnly: true`,
`mutatingActionsEnabled: false`, and zero runnable operations. Invalid intent
returns `400`.

## Response

Each `operationRows` entry represents one site/cluster pair and includes:

- Provider, deployment type, node count, and role summary.
- The source `matrixRowId` from the provider/topology matrix.
- Provider operations such as inventory discovery, power control, boot order,
  image mount, and node imaging.
- Deployment operations such as HCI cluster create, storage-only cluster
  create, compute-only registration, mixed topology validation, and Prism
  Element validation.
- Alias-aware evidence requirement records and missing evidence counts.
- Disabled execution flags for live discovery, provider operations, deployment
  operations, and job submission.

Provider operation records keep manual/static inventory marked as implemented
read-only where applicable, but `canRun` remains false. Mutating operations are
blocked even when all evidence is accepted because adapter activation, runtime
admission, credential handoff, controlled UAT completion, and mutating
enablement still have to pass in a future explicit release.

## Review Artifacts

The native Foundation review packet exports the catalog as
`provider-operation-catalog.json`, records operation counts in `manifest.json`,
and includes those counts in `nativeFoundationGateSummary`. Durable review jobs
emit the same row, operation, mutating-operation, and runnable-operation counts
in persisted logs. Captured Validation Evidence stores the catalog status and
counts with the review packet metadata.

Use [Provider Operation Admission Review](provider-operation-admission-review.md)
to convert catalog operations into blocked future-admission records with
approval and evidence binding status.

## Boundary

The catalog does not run discovery, power actions, boot changes, virtual media
mounts, image staging, node imaging, cluster creation, compute registration,
storage cluster formation, Prism Element validation, adapter loading, credential
handoff, queue replay, or job submission.
