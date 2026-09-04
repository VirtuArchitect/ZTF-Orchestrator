# Native Foundation Provider Operation Queue Plan

Current release marker: `v1.8.1`.

`POST /api/native-foundation/provider-operation-queue-plan` converts the
provider operation admission review into deterministic read-only queue items
for every site and cluster operation. It is the planning step between
per-operation admission records and any future durable queue implementation.

The queue plan answers: if operations were later admitted in a controlled UAT
lane, what order, dependency, site, cluster, provider, deployment type, and
phase metadata would be carried into the queue?

## API

```text
POST /api/native-foundation/provider-operation-queue-plan
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

Valid intent returns `200` with `status: blocked`, `readOnly: true`,
`mutatingActionsEnabled: false`, and zero queued, persisted, or runnable
operations. Invalid intent returns `400`.

## Queue Items

Each `operationQueueItems` record includes:

- Deterministic queue item ID and queue order.
- Site, cluster, provider, deployment type, operation, and phase metadata.
- Source admission record, operation catalog row, topology matrix row, and
  execution graph step IDs where available.
- Dependency IDs for the previous item in the same cluster, graph step, and
  source admission record.
- Missing evidence count, mutating flag, and blocked reasons.
- Disabled enqueue, run, submit, and persistence flags.

All queue items remain blocked. Optional approval and evidence IDs are carried
for traceability, but they do not admit, enqueue, persist, submit, or run any
operation.

## Review Artifacts

The native Foundation review packet exports the queue plan as
`provider-operation-queue-plan.json`, includes queue item, queued-operation, and
persisted-queue counts in `manifest.json`, and carries them in
`nativeFoundationGateSummary`. Durable review jobs emit the same queue-plan
counts in persisted logs. Captured Validation Evidence stores the queue-plan
status and counts with the review packet metadata.

Use [Provider Operation Queue Admission Review](provider-operation-queue-admission-review.md)
to convert queue-plan items into blocked future-admission records before any
future queue persistence or enqueue path is considered.

## Boundary

The queue plan does not persist queue records, register replay, enqueue jobs,
submit operations, start runners, load adapters, resolve or hand off
credentials, open sockets, contact hardware, run discovery, stage images, image
nodes, create clusters, register compute nodes, validate Prism Element state,
or perform any mutating native Foundation work.
