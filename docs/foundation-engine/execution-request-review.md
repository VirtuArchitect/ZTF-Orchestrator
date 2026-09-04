# Native Foundation Execution Request Review

Current release marker: `v1.8.1`.

Execution request review builds the read-only request object that a future native
Foundation job submission path would use after admission, adapter contract,
approval, evidence, checkpoint, packet output/export gate, and
controlled UAT completion gate, and secret-resolution gates are satisfied.

This endpoint does not submit a job.

## API

```text
POST /api/native-foundation/execution/request-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "approvalId": "<optional approval id>",
  "evidenceId": "<optional validation evidence id>",
  "phase": "full_deployment"
}
```

Valid intent returns `200` with a blocked read-only request review. Invalid
intent returns `400`.

## Request Object

The generated request includes:

- Deterministic execution request ID.
- Workflow and phase.
- Plan, intent hash, and discovery hash.
- Optional approval and evidence IDs.
- Adapter request IDs from the execution adapter contract.
- `adapterRequestGateSummary`, keyed by adapter request ID, when captured packet
  gate context exists.
- `controlledUatCompletionGateSummary`, keyed by adapter request ID, when
  captured controlled UAT completion gate context exists.
- `submitted: false`.
- `jobId: null`.
- `queueName: null`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Execution adapter contract review.
- Adapter request envelope presence.
- Packet output/export gate context inherited from adapter request envelopes.
- Controlled UAT completion gate context inherited from adapter request
  envelopes.
- The final job-submission disablement block.

## Boundary

Execution request review does not enqueue work, create a background job, call
Foundation, call Prism Element, load adapters, resolve secrets, or contact
hardware providers. It exists to make the future start request reviewable before
any mutating path is enabled.
