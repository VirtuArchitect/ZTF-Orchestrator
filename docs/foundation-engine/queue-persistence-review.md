# Native Foundation Queue Persistence Review

Current release marker: `v1.8.0`.

Queue persistence review declares the durable queue records a future native
Foundation worker would need before multi-site or multi-cluster deployment jobs
could be submitted. It composes execution submission, job state, execution
audit, execution retention, and restart/resume reviews into per-wave queue
records.

This capability cannot persist queue state or deploy infrastructure.

## API

```text
POST /api/native-foundation/execution/queue-persistence-review
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

Valid intent returns `200` with a blocked read-only queue persistence review.
Invalid intent returns `400`.

When `approvalId` and `evidenceId` identify the same reviewed native Foundation
package, the review carries adapter request gate summary counts into queue
persistence readiness. Without that binding, the approval/evidence gate remains
blocked.

## Queue Records

Each `queueRecords` item includes:

- Queue record ID and submission record ID.
- Queue order, schedule item ID, site names, cluster count, and deployment
  types.
- Job state ID, audit plan ID, retention plan ID, and restart/resume review ID.
- Required state transitions from the job-state model.
- `recordPersisted: false`.
- `checkpointPersisted: false`.
- `auditPersisted: false`.
- `retentionPersisted: false`.
- `replayRegistered: false`.
- `jobEnqueued: false`.
- `persistenceEnabled: false`.
- `replayEnabled: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Queue persistence source reviews are linked.
- Queue records are declared from submission records.
- Queue records bind to job-state transitions.
- Approval and evidence gates are bound to queue persistence.
- Queue persistence remains disabled.
- Queue replay remains disabled.
- Job enqueue remains disabled.

## Boundary

Queue persistence review cannot create durable queue records, persist
checkpoints, append audit events, create retention rows, register replay state,
enqueue jobs, start workers, call adapters, call Foundation, call Prism Element,
resolve secrets, or mutate hardware.

Enabling queue persistence requires a future explicit change after execution
submission, job-state persistence, audit persistence, retention persistence,
replay recovery, backup/restore proof, and controlled hardware UAT pass.
