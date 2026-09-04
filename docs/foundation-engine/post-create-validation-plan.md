# Native Foundation Post-Create Validation Plan

Current release marker: `v1.8.1`.

The post-create validation plan turns native Foundation cluster formation output
into read-only validation payload previews for HCI, compute-only, storage-only,
and mixed clusters.

This capability is for operator review, approval packets, and controlled-UAT
design only. It does not call Prism Element, register compute nodes, inspect
cluster health, collect live evidence, or change cluster state.

## API

```text
POST /api/native-foundation/post-create/validation-plan
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "discoveryFacts": {}
}
```

`discoveryFacts` is optional and follows the same shape used by the discovery
reconciliation, node imaging plan, and cluster formation plan APIs.

Valid intent returns `200` with a blocked read-only validation plan. Invalid
intent returns `400`.

## Payload Preview

Each cluster validation plan contains:

- Site, cluster, provider, deployment type, and cluster VIP.
- Whether the cluster formation plan is ready for review.
- Deployment-type-specific validation check labels.
- Future evidence output names for logs, cluster state, and membership review.
- `canValidateCluster: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response includes checks for:

- Cluster formation plan readiness.
- Required post-create validation inputs.
- The hard block that prevents live validation execution.

## Boundary

The plan is intentionally non-mutating. It cannot contact Prism Element, run
health checks, register compute nodes, validate storage services, capture live
cluster evidence, or mark deployment complete.
