# Native Foundation Provider Operation Admission Review

Current release marker: `v1.8.1`.

`POST /api/native-foundation/provider-operation-admission-review` converts the
provider operation catalog into per-operation admission records for a future
controlled UAT run. It is the review step between knowing which operations a
site/cluster needs and allowing any future runner to persist or execute those
operations.

## API

```text
POST /api/native-foundation/provider-operation-admission-review
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

## Review Records

Each `operationAdmissionRecords` item includes:

- Site, cluster, provider, deployment type, and source matrix/catalog IDs.
- Provider or deployment operation ID, label, phase, and mutating flag.
- Alias-aware required evidence records and missing evidence count.
- Optional approval and Validation Evidence bindings.
- Disabled admission, run, and job-submission flags.

The review can mark approval/evidence bindings as present for operator
traceability, but `admittedOperationCount`, `runnableOperationCount`, and all
per-record `canRunOperation` values remain zero or false.

## Review Artifacts

The native Foundation review packet exports the review as
`provider-operation-admission-review.json`, includes admission counts in
`manifest.json`, and carries them in `nativeFoundationGateSummary`. Durable
review jobs emit the same admission record, admitted-operation, and
runnable-operation counts in persisted logs. Captured Validation Evidence
stores the admission status and counts with the packet metadata.

Use [Provider Operation Queue Plan](provider-operation-queue-plan.md) to turn
these blocked admission records into deterministic future queue items without
persisting, enqueueing, or running operations.

## Boundary

The review does not persist admission decisions, admit operations, start
runners, load adapters, resolve or hand off credentials, open sockets, contact
hardware, run discovery, stage images, image nodes, create clusters, register
compute nodes, validate Prism Element state, enqueue jobs, replay queues, or
submit mutating native Foundation work.
