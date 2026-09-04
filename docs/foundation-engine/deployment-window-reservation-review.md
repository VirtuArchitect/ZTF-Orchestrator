# Native Foundation Deployment Window Reservation Review

Current release marker: `v1.8.1`.

Deployment window reservation review converts wave authorization records,
deployment policy windows, and execution lock plans into read-only reservation
requests. It is the operator checkpoint for confirming that future multi-site
deployment windows would have site windows, cluster scope, lock references, and
blast-radius metadata before any reservation mechanism is enabled.

This capability does not persist reservations, acquire locks, reserve
deployment windows, open waves, enqueue jobs, start runners, call Foundation,
contact hardware providers, resolve secrets, or mutate infrastructure.

## API

```text
POST /api/native-foundation/deployment-windows/reservation-review
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

Valid intent returns `200` with a blocked read-only reservation review. Invalid
intent returns `400`.

## Review Output

The review returns:

- `reservationRequests`: one deterministic reservation request per deployment
  wave.
- `siteReservations`: per-site deployment window, concurrency, cluster count,
  site lock, and cluster lock references.
- `windowStatus`: whether the declared windows are ready for operator review.
- `lockRequestIds`: the lock-plan request IDs associated with the future
  reservation scope.
- `checks`: wave authorization availability, deployment window readiness, lock
  linkage, reservation request presence, and the final reservation disablement
  block.

## Boundary

Every response returns `status: blocked`, `canReserveDeploymentWindows: false`,
`canStartReservedWaves: false`, and `mutatingActionsEnabled: false`. Window
reservation can only become persistent in a future explicit change after wave
authorization persistence, lock acquisition, permit issuance, runner start,
recovery execution, retained evidence export, and controlled hardware UAT are
validated.

Use [Deployment Scheduler Review](deployment-scheduler-review.md) to convert
disabled reservation records into future wave-opening order and queue records
without creating jobs.
