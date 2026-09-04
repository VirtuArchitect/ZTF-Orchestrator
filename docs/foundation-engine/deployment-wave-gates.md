# Native Foundation Deployment Wave Gates

Current release marker: `v1.8.1`.

Deployment wave gate review turns the read-only execution graph and deployment
policy into per-wave, per-site gate records. It is the scheduling-adjacent
review operators use to inspect multi-site blast radius before any future
native Foundation adapter can open a deployment wave.

This capability does not reserve windows, enqueue jobs, start runners, call
Foundation, contact hardware providers, or mutate infrastructure.

## API

```text
POST /api/native-foundation/deployment-wave-gates/review
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

Valid intent returns `200` with a blocked read-only wave gate review. Invalid
intent returns `400`.

## Review Output

The review returns:

- `waveGates`: deterministic site-wave records from the execution graph.
- `siteGates`: per-site deployment window, concurrency, cluster, and blocked
  reason records.
- `deploymentTypes`: the HCI, compute-only, storage-only, or mixed deployment
  types present in each wave.
- `sourceReviews`: deployment policy, approval binding, and execution graph
  statuses.
- `checks`: policy readiness, approval/evidence binding, wave availability, and
  the final scheduling disablement block.

When `approvalId` and `evidenceId` identify the same reviewed native Foundation
packet, `approval-evidence-binding-reviewed` can pass. Wave opening remains
blocked because mutating scheduling is not enabled.

## Boundary

Every response returns `status: blocked`, `canOpenDeploymentWaves: false`, and
`mutatingActionsEnabled: false`. Deployment wave opening can only be enabled in
a future explicit change after controlled hardware UAT proves adapter execution,
locking, recovery, retained evidence, and blast-radius behavior.
