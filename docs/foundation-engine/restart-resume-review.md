# Native Foundation Restart/Resume Review

Current release marker: `v1.8.0`.

Restart/resume review composes the read-only resume checkpoint, job-state plan,
retention plan, audit plan, lock plan, and deployment scheduler review into a
single replay-readiness artifact. It shows which cluster checkpoints, state
transitions, retained artifacts, locks, and schedule records a future native
Foundation runner would need after a service restart.

This capability does not persist job state, replay queues, restore checkpoints,
acquire locks, start runners, call adapters, call Foundation, contact Prism
Element, contact hardware providers, or mutate infrastructure.

## API

```text
POST /api/native-foundation/execution/restart-resume-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>",
  "phase": "full_deployment",
  "approvalId": "<optional approval id>",
  "evidenceId": "<optional validation evidence id>"
}
```

Valid intent returns `200` with a blocked read-only restart/resume review.
Invalid intent returns `400`.

## Review Output

The review returns:

- `resumeRecords`: one deterministic record per cluster checkpoint.
- `requiredRestartArtifacts`: the job-state, checkpoint, audit, evidence, and
  retained artifacts needed for future replay.
- `stateTransitions`: the job-state model that would drive replay decisions.
- `checks`: checkpoint, job state, transition, retention, audit, lock,
  scheduler, artifact, persistence, and replay disablement checks.

## Boundary

Every response returns `status: blocked`, `canResumeAfterRestart: false`,
`canReplayJobState: false`, `canRestoreCheckpoint: false`,
`canAcquireReplayLocks: false`, and `mutatingActionsEnabled: false`.
Restart/resume can only become operational in a future explicit change after
durable job state persistence, checkpoint storage, retained artifact restore,
replay locking, audit retention, runner start, and controlled hardware UAT are
validated.
