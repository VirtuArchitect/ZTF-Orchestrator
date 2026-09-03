# Native Foundation Cluster Formation Plan

Current release marker: `v1.8.0`.

The cluster formation plan turns native Foundation intent and node imaging
readiness into read-only payload previews for HCI, compute-only, storage-only,
and mixed topologies.

## API

```text
POST /api/native-foundation/clusters/formation-plan
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>",
  "discoveryFacts": {
    "sites": []
  }
}
```

`discoveryFacts` is optional and is passed through to the node imaging plan
readiness checks. Valid intent returns `200` with a blocked read-only formation
plan. Invalid intent returns `400`.

## Payload Preview

Each cluster plan includes:

- Site, provider, deployment type, VIP, node count, and role summary.
- Topology actions from the native execution graph.
- HCI, compute, and storage node groupings.
- Post-create validation labels for future UAT.
- A `canCreateCluster: false` execution boundary.

## Checks

| Check | Meaning |
| --- | --- |
| `execution-graph-reviewed` | Cluster topology graph steps are available. |
| `node-imaging-plan-ready` | All node imaging payload previews are ready for review. |
| `cluster-formation-fields-complete` | Cluster formation payload previews contain required fields. |
| `cluster-create-readiness-gates-reviewed` | Cluster-create readiness gates have been reviewed. |
| `cluster-formation-disabled` | HCI, compute, storage, and mixed cluster formation remain disabled. |

## Boundary

The endpoint does not create Prism Element clusters, register compute-only
nodes, form storage-only clusters, call Foundation, run post-create validation,
or mutate any Nutanix or hardware target.
