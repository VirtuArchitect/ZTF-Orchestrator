# Native Foundation Intent Schema

Current release marker: `v1.8.0`.

`native-foundation-deploy` is a planning-only workflow for multi-site,
multi-cluster Foundation deployment intent. It does not execute deployment work
in this release.

Use [Discovery Preview](discovery-preview.md) to normalize submitted intent into
read-only site, cluster, and node facts.

Use [Plan And Approval Binding](plan-approval-binding.md) to generate
deterministic plan hashes and approval metadata.

Use [Adapter Contracts](adapter-contracts.md) to review the versioned read-only
provider and deployment contract registry for the intent.

Use [Secret References](secret-references.md) to review provider and BMC
credential reference names without exposing or resolving secret values.

## Root Fields

| Field | Required | Purpose |
|---|---|---|
| `ztf_orchestrator.workflow_family` | Yes | Must be `native_foundation`. |
| `foundation_engine.mode` | Yes | Must be `planning_only` until execution adapters are validated. |
| `foundation_engine.artifact_policy` | Recommended | Use `operator_supplied`; Nutanix binaries are not bundled. |
| `foundation_engine.uat_evidence` | Optional | Sanitized evidence references for readiness gates. |
| `foundation_engine.orchestration` | Optional | Read-only site strategy for execution graph planning. |
| `foundation_engine.policy` | Recommended | Read-only deployment window, approval, evidence, and blast-radius policy. |
| `foundation_engine.checkpoint` | Optional | Read-only completed and failed step IDs for resume checkpoint review. |
| `sites` | Yes | Non-empty list of deployment sites. |

## Site Fields

| Field | Required | Values |
|---|---|---|
| `site_name` | Yes | Operator-defined site label. |
| `hardware_provider` | Yes | `manual_static`, `nx`, `cisco_intersight`, `dell_idrac_redfish`, `hpe_ilo_redfish`, `lenovo_xcc_redfish`. |
| `provider_credential_ref` | Provider-dependent | Named site provider credential reference for NX or Intersight adapters. |
| `api_credential_ref` | Provider-dependent | Alternate named API credential reference for NX or Intersight adapters. |
| `bmc_credential_ref` | Provider-dependent | Named site BMC credential reference for Redfish adapters. |
| `concurrency_limit` | Recommended | Positive integer. |
| `deployment_window` | Recommended | Timezone, days, start, and end used by deployment policy review. |
| `network_profile` | Recommended | DNS, NTP, gateway, VLAN, and deployment network values. |
| `clusters` | Yes | Non-empty list. |

## Cluster Fields

| Field | Required | Values |
|---|---|---|
| `cluster_name` | Yes | Target cluster name. |
| `deployment_type` | Yes | `hci`, `compute_only`, `storage_only`, `mixed_hci_compute`, `mixed_storage_compute`. |
| `cluster_vip` | Yes | Prism Element cluster VIP. |
| `aos_image` | Yes | Operator-defined image reference. |
| `hypervisor_image` | Yes | Operator-defined hypervisor image reference. |
| `nodes` | Yes | Non-empty list. |

## Node Fields

| Field | Required | Notes |
|---|---|---|
| `node_serial` | Yes | Stable inventory match key. |
| `role` | Yes | `hci`, `compute_only`, or `storage_only`. |
| `bmc_address` | Yes | BMC, iDRAC, iLO, XCC, or equivalent endpoint. |
| `host_ip` | Yes | Hypervisor host IP. |
| `cvm_ip` | Role-dependent | Required for `hci` and `storage_only`; omitted for `compute_only`. |

## Example

```yaml
ztf_orchestrator:
  workflow_family: native_foundation
  execution_state: planning_only

foundation_engine:
  mode: planning_only
  artifact_policy: operator_supplied
  foundation_version: "5.11"
  orchestration:
    site_strategy: sequential
  policy:
    max_parallel_sites: 1
    max_parallel_clusters_per_site: 1
    require_approval_binding: true
    require_validation_evidence: true
    failure_policy: stop_site
  checkpoint:
    completed_step_ids: []
    failed_step_ids: []
  uat_evidence:
    hardware_provider_discovery:
      accepted: false
      evidence_id: ""
    image_source_verified:
      accepted: false
      evidence_id: ""
    network_path_verified:
      accepted: false
      evidence_id: ""
    recovery_runbook_reviewed:
      accepted: false
      evidence_id: ""

sites:
  - site_name: site-a
    hardware_provider: manual_static
    provider_credential_ref: nf-provider-site-a
    bmc_credential_ref: nf-bmc-site-a
    concurrency_limit: 1
    deployment_window:
      timezone: UTC
      days:
        - Sat
        - Sun
      start: "00:00"
      end: "06:00"
    network_profile:
      management_subnet: 192.0.2.0/24
      management_gateway: 192.0.2.1
      management_vlan_id: 120
      dns_servers:
        - 192.0.2.53
      ntp_servers:
        - 192.0.2.123
    clusters:
      - cluster_name: hci-cluster-a
        deployment_type: hci
        cluster_vip: 192.0.2.10
        aos_image: aos-image-ref
        hypervisor_image: ahv-image-ref
        nodes:
          - node_serial: NODE-A
            role: hci
            bmc_address: 192.0.2.20
            host_ip: 192.0.2.30
            cvm_ip: 192.0.2.40
          - node_serial: NODE-B
            role: hci
            bmc_address: 192.0.2.21
            host_ip: 192.0.2.31
            cvm_ip: 192.0.2.41
          - node_serial: NODE-C
            role: hci
            bmc_address: 192.0.2.22
            host_ip: 192.0.2.32
            cvm_ip: 192.0.2.42
```
