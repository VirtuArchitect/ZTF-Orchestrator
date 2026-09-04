# Native Foundation Execution Lock Plan

Current release marker: `v1.8.1`.

Execution lock plan review defines the future lock requests a native Foundation
run would need before any adapter execution can start. It covers the global
orchestration lock, per-site locks, per-cluster locks, and provider/deployment
adapter locks. It carries retained evidence export and secret audit persistence
prerequisite status forward from execution permit review. When matching packet
evidence is supplied, adapter lock metadata also carries the packet
output/export gate summary by adapter request ID.

This capability cannot acquire locks.

## API

```text
POST /api/native-foundation/execution/lock-plan
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

Valid intent returns `200` with a blocked read-only lock plan. Invalid intent
returns `400`.

## Lock Requests

Each `lockRequests` item includes:

- Deterministic lock request ID.
- Lock name.
- Scope: `orchestration`, `site`, `cluster`, or `adapter`.
- Acquisition order.
- Phase.
- Site, cluster, provider, deployment, policy, or permit metadata.
- Adapter request packet output/export gate summary for adapter locks, when
  available.
- `leaseSeconds: 0`.
- `lockMode: review_only`.
- `acquired: false`.
- `released: false`.
- `canAcquire: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Deployment policy readiness apart from scheduling.
- Execution permit readiness apart from permit issuance.
- Dry-run ledger readiness apart from adapter execution.
- Lock target generation.
- Retained evidence export prerequisite declaration.
- Packet output/export gate summary binding.
- Secret audit persistence prerequisite status.
- Locks remain unacquired.
- The final lock-acquisition disablement block.

## Boundary

Execution lock plan review cannot acquire locks, write lock records, reserve
deployment windows, enqueue jobs, submit permit-backed requests, run adapters,
call Foundation, call Prism Element, resolve secrets, or mutate hardware.

The lock plan is a blast-radius review artifact only. Future lock acquisition
requires native Foundation job persistence, permit issuance, adapter execution,
retained evidence export controls, secret audit persistence controls, recovery
behavior, audit retention, and controlled hardware UAT evidence.
