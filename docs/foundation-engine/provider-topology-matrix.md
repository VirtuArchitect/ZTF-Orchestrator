# Native Foundation Provider/Topology Matrix

Current release marker: `v1.8.1`.

`POST /api/native-foundation/provider-topology-matrix` evaluates each planned
site and cluster against the read-only provider contracts, deployment topology
contracts, phase evidence requirements, and accepted
`foundation_engine.uat_evidence` references.

The endpoint is for multi-site deployment review. It helps operators see which
hardware providers and cluster deployment types are present in an intent, which
phases are planned for each cluster, and which evidence requirements still
block promotion.

The same matrix is exported as `provider-topology-matrix.json` in the native
Foundation review packet and summarized by the durable review job logs. That
keeps provider and deployment-type readiness attached to approval evidence even
when the operator is reviewing a downloaded packet or a completed queue record.

## Request

```json
{
  "content": "ztf_orchestrator:\n  workflow_family: native_foundation\n..."
}
```

`content` must be a valid native Foundation deployment intent.

## Response

Valid intent returns `200` with `status: blocked`, `readOnly: true`, and
`mutatingActionsEnabled: false`.

The response includes:

- `matrixRows`: one row per planned site/cluster pair.
- Provider status, read-only discovery support, deployment type status, planned
  phases, node count, and role summary.
- Provider, deployment, and phase evidence requirement records.
- Required, accepted, and missing evidence counts per row.
- Summary counts for providers, deployment types, rows, blockers, and missing
  evidence.

Evidence requirements use the same alias-aware mapping as adapter readiness.
For example, `cluster_create_uat` and `prism_element_validation` can be
satisfied by accepted `foundation_engine.uat_evidence.cluster_create_validated`
metadata.

## Boundary

The matrix does not run live discovery, contact BMCs, open sockets, stage
images, create clusters, validate live Prism Element state, reserve windows,
submit jobs, or mutate hardware. Rows stay blocked even when all evidence
requirements are accepted because execution adapters remain disabled until a
future controlled-UAT release explicitly enables a scoped provider/topology
lane.
