# Native Foundation Resume Checkpoint

Current release marker: `v1.8.1`.

Native Foundation resume checkpoints are read-only restart-position manifests.
They describe where a future native Foundation job could resume after an
interruption, but they do not resume deployment or enable any mutating adapter.

## API

```text
POST /api/native-foundation/resume-checkpoint
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>"
}
```

Invalid intent returns `400` with no generated steps.

## Checkpoint Input

Operators can include checkpoint state in the intent:

```yaml
foundation_engine:
  mode: planning_only
  artifact_policy: operator_supplied
  checkpoint:
    completed_step_ids:
      - nf-site-a-hci-cluster-a-validate-validate-plan
    failed_step_ids: []
```

Unknown step IDs are ignored and reported as warnings. The endpoint only accepts
step IDs that exist in the current execution graph.

## Resume States

Each graph step receives a `resumeStatus`:

- `completed`: step ID is listed in `completed_step_ids`.
- `failed`: step ID is listed in `failed_step_ids`.
- `next`: all dependencies are completed.
- `pending`: one or more dependencies are still pending.
- `blocked`: one or more dependencies failed.

The response also includes cluster-scoped checkpoint summaries that reference
the evidence pack, site wave, cluster wave, completed count, failed count, next
steps, pending steps, and blocked steps.

## Boundary

The checkpoint response always returns `readOnly: true`,
`mutatingActionsEnabled: false`, and `resumeMode: review_only`. A future
execution adapter must persist and validate equivalent state in durable job
storage before restart/resume can become operational.
