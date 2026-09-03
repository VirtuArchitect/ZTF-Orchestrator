# Native Foundation Execution Submission Review

Current release marker: `v1.8.0`.

Execution submission review builds the future native Foundation job submission
envelope without submitting or enqueueing deployment jobs. It composes mutating
enablement, execution request, deployment scheduler, runner readiness, and
controlled UAT entry reviews so operators can see the exact per-wave submission
records that would be needed for HCI, compute, storage, or mixed deployments.

This capability cannot deploy infrastructure.

## API

```text
POST /api/native-foundation/execution/submission-review
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

Valid intent returns `200` with a blocked read-only submission review. Invalid
intent returns `400`.

When `approvalId` and `evidenceId` identify the same reviewed native Foundation
package, the review carries the adapter request gate summaries into each
submission record. Without that binding, the approval/evidence gate remains
blocked.

## Submission Records

Each `submissionRecords` item includes:

- Submission record ID and scheduler item ID.
- Queue order, wave ID, site wave, site names, cluster count, and deployment
  types.
- Execution request ID and adapter request IDs.
- Mutating enablement, runner readiness, and controlled UAT entry review IDs.
- `jobEnqueued: false`.
- `submitted: false`.
- `canSubmitMutatingJob: false`.
- `deploymentExecutionEnabled: false`.
- `mutatingActionsEnabled: false`.
- Blocked reasons that explain why the envelope cannot be queued.

## Checks

The response checks:

- Source reviews are linked.
- Submission records are generated from scheduler waves.
- Approval and evidence gates are bound to the submission envelope.
- Mutating job submission remains disabled.
- Native Foundation runner start remains disabled.
- Target mutation remains disabled.

## Boundary

Execution submission review cannot enqueue jobs, submit jobs, start runners,
start adapter processes, open target connections, hand off credentials, invoke
adapter commands, call Foundation, call Prism Element, call hardware providers,
call BMCs, or mutate hardware.

Enabling native Foundation execution submission requires a future explicit
change after controlled UAT entry issuance, mutating enablement, runner start,
queue persistence, audit retention, backup/restore proof, and release
documentation pass.
