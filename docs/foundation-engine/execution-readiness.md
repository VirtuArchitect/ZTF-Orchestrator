# Native Foundation Execution Readiness

Current release marker: `v1.8.1`.

Execution readiness is the Phase 4 gate for native Foundation imaging and
cluster-create work. It reports whether a validated plan has the required UAT
evidence to enable a mutating execution adapter. In this release the result is
blocked by design.

Use [Execution Graph](execution-graph.md) after readiness review to see the
read-only site, cluster, dependency, and deployment-type ordering that future
native adapters must follow.

## API

```text
POST /api/native-foundation/execution/readiness
```

Request body:

```json
{
  "phase": "imaging_only",
  "content": "<native-foundation-deploy YAML>"
}
```

Supported phase values:

- `imaging_only`
- `hci_cluster_create`
- `multi_site`
- `compute_storage_topology`

## Gates

| Gate | Meaning |
|---|---|
| `plan-valid` | Native Foundation plan validation passed. |
| `execution-adapter-enabled` | A version-aware execution adapter is enabled. |
| `hardware-provider-uat` | Provider discovery was validated in controlled UAT. |
| `image-source-verified` | AOS and hypervisor image source was verified. |
| `network-path-verified` | Deployment, BMC, host, and CVM paths were verified. |
| `stop-retry-recovery-reviewed` | Operator recovery procedure was reviewed. |

## UAT Evidence In Intent

Operators can attach sanitized evidence references to the native Foundation
intent. Evidence references are accepted only when `accepted: true` and a
non-empty `evidence_id` are present.

```yaml
foundation_engine:
  mode: planning_only
  artifact_policy: operator_supplied
  uat_evidence:
    hardware_provider_discovery:
      accepted: true
      evidence_id: nf-provider-uat-001
    image_source_verified:
      accepted: true
      evidence_id: nf-image-uat-001
    network_path_verified:
      accepted: true
      evidence_id: nf-network-uat-001
    recovery_runbook_reviewed:
      accepted: true
      evidence_id: nf-recovery-uat-001
```

Accepted evidence can move the provider, image, network, and recovery gates to
`pass`. It cannot enable mutating execution by itself. The
`execution-adapter-enabled` gate remains blocked until a version-aware adapter
is implemented and validated.

## Current Result

Valid native Foundation plans return `status: blocked`, `readOnly: true`, and
`mutatingActionsEnabled: false` while the execution adapter gate is blocked.
This is intentional. The endpoint gives operators and maintainers a concrete
evidence checklist before imaging-only or cluster-create adapters can be
enabled.
