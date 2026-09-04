# Native Foundation Phase Catalog

Current release marker: `v1.8.1`.

`GET /api/native-foundation/phases` exposes the operator-facing rollout state
for the native Foundation engine. It is a read-only contract used by the UI,
tests, and documentation to keep phase status aligned while mutating execution
remains disabled.

Use [Phase Advancement Review](phase-advancement-review.md) to bind a requested
phase to a specific intent and confirm promotion remains blocked until
controlled UAT and explicit adapter enablement are complete.

## Response Scope

The endpoint returns:

- `workflow`: `native-foundation-deploy`.
- `contractVersion`: the current read-only adapter contract version.
- `currentExecutionMode`: `planning_only`.
- `supportedReadinessPhases`: readiness phases accepted by
  `/api/native-foundation/execution/readiness`.
- `summary`: phase count, implemented phase count, mutating-enabled count, and
  the current boundary statement.
- `phases`: ordered records for phases 0 through 8.

Every phase currently returns `readOnly: true` and
`mutatingActionsEnabled: false`. A future controlled-UAT release must change
this endpoint, the support matrix, roadmap, validation status, and tests in the
same change before any mutating adapter is advertised.

Current summary: 9 phases, 9 implemented read-only phases, and 0
mutating-enabled phases.

Supported readiness phases:

- `compute_storage_topology`
- `hci_cluster_create`
- `imaging_only`
- `multi_site`

## Current Phases

| Order | Phase | Status | Current outcome |
|---:|---|---|---|
| 0 | Architecture Boundary | Implemented foundation | Defines ownership, safety boundaries, and artifact rules. |
| 1 | Intent Model | Implemented foundation | Validates multi-site, provider, cluster, deployment type, node, and role intent. |
| 2 | Read-Only Discovery | Implemented foundation | Normalizes operator-supplied inventory and reconciles discovery-style facts. |
| 3 | Plan And Approval Binding | Implemented foundation | Creates deterministic plan, intent, discovery, approval, and evidence metadata. |
| 4 | Imaging-Only UAT | Implemented readiness gate | Builds image, network, secret, discovery, and per-node imaging plans. |
| 5 | HCI Cluster Create UAT | Implemented planning graph | Builds HCI formation and post-create validation previews. |
| 6 | Multi-Site And Multi-Cluster | Implemented planning graph | Builds waves, policy, evidence packs, reservations, scheduler, and recovery reviews. |
| 7 | Compute-Only And Storage-Only | Implemented planning graph | Builds topology-specific support and validation previews. |
| 8 | Production Hardening | Implemented read-only hardening | Builds registry, allow-list, runtime admission, queue, job-state, restart/resume, backup/restore, and review-packet controls. |

## Operator Boundary

The catalog does not enable execution, load adapters, reserve hardware, open
maintenance windows, resolve secrets, call Foundation, call Prism Element, or
submit jobs. It only reports current capability and the next gate for each
phase.
