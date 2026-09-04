# Native Foundation Deployment Wave Rehearsal

Current release marker: `v1.8.1`.

Deployment wave rehearsal converts deployment wave gates, per-cluster evidence
packs, recovery actions, and runner readiness into an operator-facing
read-only package for multi-site Foundation UAT planning.

This capability does not reserve deployment windows, open waves, enqueue jobs,
start runners, call Foundation, contact hardware providers, resolve secrets, or
mutate infrastructure.

## API

```text
POST /api/native-foundation/deployment-wave-rehearsal
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

Valid intent returns `200` with a blocked read-only rehearsal plan. Invalid
intent returns `400`.

## Review Output

The review returns:

- `waveRehearsals`: deterministic per-wave packages with site names, cluster
  records, deployment types, evidence pack IDs, recovery action IDs, and
  operator go/no-go controls.
- `blastRadius`: per-wave site count, cluster count, deployment type list,
  failure policy, and configured parallelism limits.
- `checks`: wave-gate readiness, evidence-pack availability, recovery-control
  declaration, runner blocker declaration, rehearsal generation, and the final
  execution-disablement block.
- `sourceReviews`: deployment wave gate, evidence pack, recovery plan, runner
  readiness, and deployment policy statuses.

When matching `approvalId` and `evidenceId` are supplied, deployment wave gates
can pass their approval/evidence binding check. The rehearsal remains blocked
because execution, scheduling, locking, and adapter calls are not enabled.

## Boundary

Every response returns `status: blocked`, `canStartWaveExecution: false`,
`canReserveDeploymentWindows: false`, and `mutatingActionsEnabled: false`.
Deployment wave execution can only be enabled in a future explicit change after
controlled hardware UAT proves adapter execution, locking, recovery, retained
evidence export, and blast-radius behavior.

Use [Deployment Wave Authorization Review](deployment-wave-authorization-review.md)
to compose rehearsed waves, evidence pack approvals, permit reviews, lock
plans, and runner blockers into a read-only wave authorization package.
