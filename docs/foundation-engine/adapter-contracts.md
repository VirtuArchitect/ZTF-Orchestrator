# Native Foundation Adapter Contracts

Current release marker: `v1.8.0`.

Adapter contracts define the versioned boundary between native Foundation
planning and future provider or deployment execution adapters. They are
read-only descriptors in this release and do not enable hardware mutation.

## API

```text
GET /api/native-foundation/adapter-contracts
POST /api/native-foundation/adapter-contracts
```

`GET` returns the full contract registry. `POST` accepts a
`native-foundation-deploy` intent and evaluates the providers and deployment
types requested by that intent against the registry.

Request body for `POST`:

```json
{
  "content": "<native-foundation-deploy YAML>"
}
```

## Contract Version

Current contract version:

```text
native-foundation-adapter-contract/v1.8.0-readonly
```

Future mutating adapters must bind to a specific contract version. Changing
provider capabilities, mutating phases, required evidence, or topology semantics
requires a contract version update and matching documentation.

Use [Evidence Packs](evidence-packs.md) to bind contract requirements to a
specific cluster, plan hash, execution graph, and readiness record.
Use [Adapter Promotion Review](adapter-promotion-review.md) to review whether a
specific provider and deployment type have enough evidence to enter controlled
UAT.

## Provider Contracts

| Provider | Current status | Mutation |
|---|---|---|
| `manual_static` | `implemented_read_only` | Disabled |
| `nx` | `adapter_planned` | Disabled |
| `cisco_intersight` | `adapter_planned` | Disabled |
| `dell_idrac_redfish` | `adapter_planned` | Disabled |
| `hpe_ilo_redfish` | `adapter_planned` | Disabled |
| `lenovo_xcc_redfish` | `adapter_planned` | Disabled |

Only `manual_static` has an implemented read-only contract. It normalizes
operator-supplied inventory from intent. All provider contracts report
`mutatingActionsEnabled: false`.

## Deployment Contracts

| Deployment type | Current status | Planned phases |
|---|---|---|
| `hci` | `planning_graph_only` | `imaging_only`, `hci_cluster_create` |
| `compute_only` | `planning_graph_only` | `imaging_only`, `compute_storage_topology` |
| `storage_only` | `planning_graph_only` | `imaging_only`, `compute_storage_topology` |
| `mixed_hci_compute` | `planning_graph_only` | `imaging_only`, `hci_cluster_create`, `compute_storage_topology` |
| `mixed_storage_compute` | `planning_graph_only` | `imaging_only`, `compute_storage_topology` |

All deployment contracts report `mutatingActionsEnabled: false`.

## Promotion Rule

A provider or deployment contract can move beyond read-only planning only when:

- The target hardware family and Foundation/AOS/AHV versions are named.
- Read-only discovery UAT evidence is accepted.
- Image, network, stop, retry, and recovery evidence is accepted.
- The mutating adapter binds to plan hashes and approved metadata.
- The support matrix, UAT checklist, security notes, and runbooks are updated in
  the same change set.
