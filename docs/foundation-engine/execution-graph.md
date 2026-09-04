# Native Foundation Execution Graph

Current release marker: `v1.8.1`.

The native Foundation execution graph is the read-only orchestration contract
for multi-site and multi-cluster deployment. It does not execute imaging,
power, boot, cluster creation, or Prism operations in this release.

## API

```text
POST /api/native-foundation/execution/graph
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>"
}
```

The endpoint validates the same intent used by discovery preview and plan
generation. Invalid intent returns `400` and an empty `steps` list.

## Orchestration Policy

Operators can declare the site orchestration strategy in the intent:

```yaml
foundation_engine:
  mode: planning_only
  artifact_policy: operator_supplied
  orchestration:
    site_strategy: sequential
```

Supported `site_strategy` values:

- `sequential`: plan one site wave per site.
- `parallel`: plan all sites in the same site wave.

Each site can declare `concurrency_limit`. The graph uses that value to assign
cluster waves inside the site. Invalid or missing limits are treated as `1`.

## Step Model

Each graph step includes:

- `id`: stable deterministic step identifier.
- `siteName` and `clusterName`: execution scope.
- `siteWave` and `clusterWave`: planned scheduling wave.
- `phase`: `validate`, `discovery`, `readiness`, `imaging_only`,
  `hci_cluster_create`, or `compute_storage_topology`.
- `action`: planned operation name.
- `dependsOn`: predecessor step IDs.
- `readOnly: true` and `mutatingActionsEnabled: false`.

## Deployment-Type Actions

| Deployment type | Planned actions |
|---|---|
| `hci` | Image nodes, form HCI cluster, verify Prism Element. |
| `compute_only` | Image nodes, register compute-only nodes, verify compute registration. |
| `storage_only` | Image nodes, form storage-only cluster, verify storage services. |
| `mixed_hci_compute` | Image nodes, form HCI cluster, register compute nodes, verify mixed topology. |
| `mixed_storage_compute` | Image nodes, form storage-only cluster, register compute nodes, verify mixed topology. |

These actions are planning artifacts only. A future mutating adapter must bind
to the matching plan hash, approved metadata, readiness evidence, provider
contract, and version-specific support record before it can execute. See
[Adapter Contracts](adapter-contracts.md) for the current read-only contract
registry.

Use [Evidence Packs](evidence-packs.md) to review the cluster-scoped graph,
readiness, and contract record that future UAT promotion must reference.
