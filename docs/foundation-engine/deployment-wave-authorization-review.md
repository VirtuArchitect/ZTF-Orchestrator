# Native Foundation Deployment Wave Authorization Review

Current release marker: `v1.8.1`.

Deployment wave authorization review composes deployment wave rehearsal,
evidence pack approval, execution permit review, execution lock plan, and
runner readiness into one read-only authorization package per wave. It is the
operator checkpoint for reviewing whether a future wave has the approvals,
locks, recovery context, and blast-radius metadata that would be required
before execution could ever be enabled.

This capability does not persist authorization, issue permits, acquire locks,
reserve deployment windows, enqueue jobs, start runners, call Foundation,
contact hardware providers, resolve secrets, or mutate infrastructure.

## API

```text
POST /api/native-foundation/deployment-waves/authorization-review
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

Valid intent returns `200` with a blocked read-only authorization review.
Invalid intent returns `400`.

## Review Output

The review returns:

- `waveAuthorizations`: one deterministic authorization record per deployment
  wave.
- `clusterAuthorizations`: per-cluster evidence pack, pack approval, lock
  request, and recovery action references.
- `packApprovalStatus`: whether every pack in the wave is ready for operator
  review.
- `blastRadius`: the site, cluster, deployment type, failure policy, and
  parallelism limits inherited from the wave rehearsal.
- `checks`: wave rehearsal availability, evidence pack approval readiness,
  permit package availability, lock plan availability, runner blocker
  declaration, and the final authorization persistence disablement block.

## Boundary

Every response returns `status: blocked`, `canAuthorizeDeploymentWaves: false`,
`canStartWaveExecution: false`, and `mutatingActionsEnabled: false`. Wave
authorization can only become persistent in a future explicit change after
approval storage, lock acquisition, permit issuance, retained evidence export,
runner start, recovery execution, and controlled hardware UAT are validated.

Use [Deployment Window Reservation Review](deployment-window-reservation-review.md)
to turn reviewed wave authorization, site windows, and site/cluster lock
requests into disabled reservation records before any future scheduler work.
