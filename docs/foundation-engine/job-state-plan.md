# Native Foundation Job State Plan

Current release marker: `v1.8.1`.

The job state plan describes the durable state model a future native Foundation
deployment worker would use to track queueing, running, checkpoint, pause,
failure, recovery, retained-export prerequisites, secret-audit prerequisites,
packet output/export gate summaries, and completion states.

This capability is read-only. It cannot create job records, acquire locks,
persist checkpoint state, replay work, or resume deployment after restart.

## API

```text
POST /api/native-foundation/execution/job-state-plan
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "phase": "full_deployment",
  "approvalId": "appr_123",
  "evidenceId": "evidence_123"
}
```

Valid intent returns `200` with a blocked read-only job state plan. Invalid
intent returns `400`.

## Job State Record

The response includes a deterministic `jobStateRecord` with:

- State ID, execution request ID, plan ID, intent hash, discovery hash, phase,
  checkpoint ID, and recovery plan version.
- Adapter request IDs that the future worker would track.
- Required review artifact names for execution request, checkpoint, recovery,
  retained evidence export, and secret audit persistence.
- Source review status for execution request, checkpoint, recovery, retained
  evidence export prerequisite, secret audit persistence, adapter output,
  command invocation, and packet gate counts.
- Adapter request packet gate summaries when matching approval/evidence IDs are
  supplied.
- `storageMode: review_only`.
- `persistenceEnabled: false`.
- `replayEnabled: false`.
- No queue name, job ID, or lock name.
- Transition names for requested, admitted, adapter contract ready, queued,
  running, checkpoint written, paused, failed, recovery reviewed, and
  completed states.
- Retention artifact names for future job state, checkpoint state, adapter
  audit logs, and redacted execution evidence.

Every transition is marked `persisted: false` and
`mutatingActionsEnabled: false`.

## Checks

The response checks:

- Execution request review availability.
- Resume checkpoint binding.
- Recovery plan availability.
- Retained evidence export prerequisite declaration.
- Secret audit persistence prerequisite status.
- Packet gate summary availability when matching approval/evidence IDs are
  supplied.
- Declared state transitions.
- The final durable job persistence disablement block.

## Boundary

The job state plan does not enqueue work, write durable records, create locks,
save checkpoint rows, start workers, replay failed steps, call provider
adapters, contact Foundation, contact Prism Element, generate retained evidence
exports, persist secret audit entries, or mutate hardware.

Durable native Foundation job persistence and replay require adapter execution,
recovery behavior, locking, audit retention, and operator resume flows to pass
controlled UAT before this boundary can change.

Use [Restart/Resume Review](restart-resume-review.md) to compose checkpoint,
job-state, retention, audit, lock, and scheduler metadata into a disabled
restart replay plan before any future resume-after-restart implementation.
