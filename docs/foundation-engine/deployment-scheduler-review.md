# Native Foundation Deployment Scheduler Review

Current release marker: `v1.8.1`.

Deployment scheduler review converts read-only deployment window reservations,
execution requests, dry-run ledgers, non-issued permits, lock plans, recovery
plans, and job-state plans into disabled schedule items. It is the operator
checkpoint for confirming how future multi-site waves would be opened and
queued after reservation review.

This capability does not persist schedules, open waves, enqueue jobs, issue
permits, acquire locks, reserve windows, start runners, call adapters, call
Foundation, contact hardware providers, or mutate infrastructure.

## API

```text
POST /api/native-foundation/deployment-scheduler/review
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

Valid intent returns `200` with a blocked read-only scheduler review. Invalid
intent returns `400`.

## Review Output

The review returns:

- `scheduleItems`: one deterministic disabled schedule item per reservation
  request.
- `queueOrder`: the future wave opening order.
- `ledgerEntryIds`: dry-run ledger entries linked to the wave sites.
- `recoveryActionIds`: recovery actions linked to the same wave sites.
- `lockRequestIds`: site and cluster lock requests required before the wave
  could open.
- `checks`: reservation, request, ledger, permit, lock, recovery, job state,
  schedule item, and scheduler disablement checks.

## Boundary

Every response returns `status: blocked`, `canOpenDeploymentWaves: false`,
`canEnqueueDeploymentJobs: false`, and `mutatingActionsEnabled: false`.
Deployment scheduling can only become persistent in a future explicit change
after reservation persistence, permit issuance, lock acquisition, durable job
state, runner start, recovery execution, retained evidence export, and
controlled hardware UAT are validated.
