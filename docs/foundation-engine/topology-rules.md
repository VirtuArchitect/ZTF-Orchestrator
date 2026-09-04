# Native Foundation Topology Rules

Current release marker: `v1.8.1`.

Native Foundation topology validation is fail-closed. A deployment type must
match the declared node roles before any future execution adapter can run.

## Planning Rules

| Deployment Type | Required Node Roles |
|---|---|
| `hci` | All nodes are `hci`. |
| `compute_only` | All nodes are `compute_only`. |
| `storage_only` | All nodes are `storage_only`. |
| `mixed_hci_compute` | At least one `hci` node and at least one `compute_only` node. |
| `mixed_storage_compute` | At least one `storage_only` node and at least one `compute_only` node. |

## Execution Boundary

The current implementation checks intent shape only. It does not claim that a
given AOS, AHV, hardware platform, disk layout, firmware level, or cluster role
combination is Nutanix-supported. Those checks must be added as
version-specific provider and image validation before execution is enabled.

## Future Validation Inputs

Future phases should add:

- Minimum HCI node counts and redundancy-factor rules.
- Compute-only and storage-only ratio requirements.
- Hardware compatibility and support status.
- Disk layout, controller, and boot mode checks.
- Network reachability from the deployment network to BMC, host, CVM, and Prism
  endpoints.
- Image compatibility and checksum validation.
