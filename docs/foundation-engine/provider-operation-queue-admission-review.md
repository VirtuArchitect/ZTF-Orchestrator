# Native Foundation Provider Operation Queue Admission Review

Current release marker: `v1.8.0`.

`POST /api/native-foundation/provider-operation-queue-admission-review`
converts the provider operation queue plan into blocked queue-admission records
for every future provider or deployment operation. It is the review step
between deterministic queue planning and any future durable queue persistence
or job enqueue path.

## API

```text
POST /api/native-foundation/provider-operation-queue-admission-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>",
  "phase": "hci_cluster_create",
  "approvalId": "<optional approved native Foundation request id>",
  "evidenceId": "<optional Validation Evidence packet id>"
}
```

Valid intent returns `200` with `status: blocked`, `readOnly: true`, and
`mutatingActionsEnabled: false`. Invalid intent returns `400`.

## Admission Records

Each `operationQueueAdmissionRecords` item includes:

- Source queue plan, queue item, operation admission, operation catalog, matrix,
  and execution graph IDs where available.
- Site, cluster, provider, deployment type, operation, phase, and dependency
  metadata.
- Optional approval and Validation Evidence bindings.
- Missing evidence and mutating-operation metadata.
- Disabled queue admission, queue persistence, enqueue, run, and submit flags.

Approval and evidence bindings can be marked present for traceability, but
`admittedOperationQueueCount`, `persistedOperationQueueCount`,
`queuedOperationCount`, `runnableOperationCount`, and all per-record execution
flags remain zero or false.

## Review Artifacts

The native Foundation review packet exports the review as
`provider-operation-queue-admission-review.json`, includes queue admission
counts in `manifest.json`, and carries them in `nativeFoundationGateSummary`.
Durable review jobs emit the same admission record, admitted-queue,
persisted-queue, queued-operation, and runnable-operation counts in persisted
logs. Captured Validation Evidence stores the queue-admission status and counts
with the packet metadata.

## Boundary

The review does not persist queue admission decisions, persist queue records,
register replay, enqueue jobs, submit operations, start runners, load adapters,
resolve or hand off credentials, open sockets, contact hardware, run
discovery, stage images, image nodes, create clusters, register compute nodes,
validate Prism Element state, or perform mutating native Foundation work.
