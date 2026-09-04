# Native Foundation Adapter Readiness

Current release marker: `v1.8.1`.

Adapter readiness reports whether the provider and deployment-type targets in a
`native-foundation-deploy` intent have enough evidence to be considered for a
future mutating adapter promotion. It is a read-only capability report. It does
not call BMCs, stage images, change boot order, image nodes, create clusters, or
enable execution.

## API

```text
POST /api/native-foundation/adapter-readiness
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>"
}
```

The response contains:

| Field | Purpose |
|---|---|
| `planId` | Native Foundation plan ID for the current intent. |
| `contractVersion` | Adapter contract registry version used for the review. |
| `summary.adapterCount` | Number of cluster-scoped adapter targets in the intent. |
| `summary.requiredEvidenceCount` | Distinct evidence requirements found across the adapter targets. |
| `summary.missingEvidenceCount` | Evidence requirements without accepted evidence IDs. |
| `evidenceCatalog` | Accepted or blocked `foundation_engine.uat_evidence` entries. |
| `adapters` | Cluster-scoped provider/topology readiness records. |
| `checks` | Overall readiness checks and fail-closed execution blockers. |

## Evidence Aliases

The report maps adapter requirements to the operator-owned
`foundation_engine.uat_evidence` catalog. For example:

| Adapter requirement | UAT evidence key |
|---|---|
| `operator_inventory_review` | `hardware_provider_discovery` |
| `redfish_discovery_uat` | `hardware_provider_discovery` |
| `power_boot_uat` | `network_path_verified` |
| `imaging_uat` | `image_source_verified` |
| `cluster_create_uat` | `cluster_create_validated` |
| `compute_registration_uat` | `compute_registration_validated` |
| `storage_cluster_uat` | `storage_cluster_validated` |
| `plan_hash_approval` | `approval_binding_review` |

An evidence entry only passes when `accepted: true` and `evidence_id` is
non-empty.

## Boundary

Even when every evidence requirement passes, adapter readiness returns
`status: blocked`, `canEnableExecution: false`, and
`mutatingActionsEnabled: false`. A future mutating adapter still requires a
specific provider/topology implementation, controlled hardware UAT, updated
support matrix entries, updated runbooks, and security review in the same
change set.
