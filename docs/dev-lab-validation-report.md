# DEV_LAB Validation Report

Date: 2026-07-22

Latest live validation refresh: 2026-07-24 17:59:00 +02:00

> Historical evidence only.
> This report records previous DEV_LAB validation and should not be treated as
> the current installation, appliance update, or production-readiness path.
> Current operator guidance starts from [Installation Guide](installation-guide.md),
> [Runbooks](runbooks/README.md), and [UAT Evidence Checklist](uat-evidence-checklist.md).

Scope: ZTF-Orchestrator v1.5.6 validation against the DEV_LAB Prism Element
lab cluster and the lab Prism Central instance deployed by ZTF-Orchestrator.

## Target Summary

- Prism Element API endpoint used for validation: `10.20.30.201:9440`
- Cluster name: `DEV_LAB`
- Prism Element version: `6.8.1`
- Reachability from the development PC:
  - `10.20.30.201:9440`: reachable
  - `10.20.30.201:22`: reachable
  - `10.20.30.200:9440`: not reachable
- Read-only inventory observed:
  - VMs: `0`
  - Images: `0`
  - Hosts: `NTNX-edf2d4be-A`
  - Network: `MGMT_VLAN`
  - Storage containers: `default-container-23330302671351`, `NutanixManagementShare`, `SelfServiceContainer`
- Prism Central validation endpoint: lab PC reachable on `9440`
- Prism Central version validated: `pc.2024.3.1.14`
- PE-to-PC registration: `RegisterToPc` returned `Register_to_PC: PASS`

Credentials were used only for authorized lab read-only API checks. No passwords or secrets are recorded in this document.

## Validation Findings

### PE Cluster Name Contract

ZTF `create_pe_objects` only seeds `cluster_info.name` when a PE cluster entry includes `name`. Several PE scripts then reference `cluster_details["cluster_info"]["name"]` during execution, verification, or logging.

The Orchestrator script wizard previously emitted `cluster_name` for some PE cluster-setting scripts. ZTF schema validation rejects that shape for `CLUSTER_SCHEMA` with a missing required `name` field.

Fix applied:

- Shared PE cluster wizard fields now include required `Cluster Name`.
- Shared PE YAML builder emits `clusters.<pe_ip>.name`.
- PE cluster-setting scripts no longer emit the stale `cluster_name` key.

### PE Role Mapping Schema

ZTF runtime uses `directory_services.ad_name` and `directory_services.role_mappings` for `CreateRoleMappingPe`, but the ZTF `CLUSTER_SCHEMA` requires the full AD directory service metadata when `directory_services` is present.

Fix applied:

- `CreateRoleMappingPe` wizard now emits a schema-valid `directory_services` block containing:
  - `directory_type: ACTIVE_DIRECTORY`
  - `ad_name`
  - `ad_domain`
  - `ad_directory_url`
  - `service_account_credential`
  - `role_mappings`

### Script Dry-Run Preflight

Orchestrator dry-run previously validated YAML syntax for individual scripts but did not apply PE cluster structure checks to script execution. That meant a stale `cluster_name` shape could reach ZTF execution.

Fix applied:

- Backend PE script dry-run preflight now validates:
  - top-level `clusters` exists
  - `clusters` is a mapping keyed by Prism Element IP
  - each checked cluster entry includes required `name`
  - Prism Element `9440` is reachable

### Destructive Action Coverage

Some backend-allowed high-risk scripts were not covered by the Orchestrator destructive-action acknowledgement lists.

Fix applied:

- Added destructive guard coverage for default password change and delete scripts including AD, DNS, NTP, role-mapping, VM, subnet, container, and existing power/update/destructive operations.
- Added regression coverage proving `DeleteContainerPe` is rejected by both `/api/execute` and `/api/jobs` unless the operator explicitly acknowledges the destructive action.
- `DeleteContainerPe` requires the exact confirmation phrase `RUN DeleteContainerPe`.

### PE Delete Schema Compatibility

ZTF delete scripts often identify objects by `name`, but shared Cerberus schemas still validate known sections using create-style required fields.

Fix applied:

- `DeleteContainerPe` wizard now emits `replication_factor` with each container entry so the YAML passes ZTF's `containers` schema before runtime deletion by name.
- `DeleteSubnetsPe` wizard now emits `vlan_id` with each network entry so the YAML passes ZTF's `networks` schema before runtime deletion by name.

### PE Container Replication Factor

The approved DEV_LAB storage-container lifecycle proved that Prism Element rejects `replication_factor: 2` on the one-node lab cluster. The wizard now defaults PE container create/delete examples to `replication_factor: 1`, with guidance to use the replication factor required by the target cluster policy in production.

## Evidence

### ZTF Schema Validation

Pure schema validation was run inside the v1.5.5 container without invoking `main.py`, avoiding script execution.

Validated PE shapes:

- `UpdatePulsePe`: pass
- `HaReservation`: pass
- `RebuildCapacityReservation`: pass
- `AcceptEulaPe`: pass
- `CreateContainerPe`: pass
- `CreateSubnetPe`: pass
- `AddNameServersPe`: pass
- `AddNtpServersPe`: pass
- `AddAdServerPe`: pass
- `CreateRoleMappingPe`: pass
- `UpdateDsip`: pass
- `DeleteVmPe`: pass
- `DeleteContainerPe`: pass
- `DeleteSubnetsPe`: pass

Additional source inspection confirmed the PE VM create/delete/power scripts consume `clusters.<pe_ip>.vms[*].name`, while `CreateVmPe` also consumes the generated VM spec keys through ZTF's v2 VM helper builders.

### Live DEV_LAB Dry-Run Preflight

Orchestrator dry-run preflight was run against DEV_LAB-style YAML. This does not launch the ZTF subprocess.

Observed results:

- `AddNameServersPe`: `4 passed, 0 failed`
- `DeleteVmPe`: `4 passed, 0 failed`
- `CreateContainerPe` disposable YAML: `4 passed, 0 failed`
- `DeleteContainerPe` disposable YAML: `6 passed, 0 failed`

Checks performed:

- YAML parse
- top-level `clusters`
- `clusters.10.20.30.201.name`
- schema-required nested item fields for PE delete payloads
- Prism Element reachability on `10.20.30.201:9440`

### Live DEV_LAB Read-Only Inventory

Latest read-only API refresh confirmed:

- Cluster: `DEV_LAB`
- Version: `6.8.1`
- Hosts: `1`
- VMs: `0`
- Images: `0`
- Networks: `MGMT_VLAN`
- Storage containers: `NutanixManagementShare`, `SelfServiceContainer`, `default-container-23330302671351`
- Disposable validation container `ztf-orchestrator-validation-container`: absent

### Live DEV_LAB Disposable Container Lifecycle

Explicit approval received for:

- `CreateContainerPe`
- `DeleteContainerPe`
- Target object: `ztf-orchestrator-validation-container`

Execution path:

- Local Orchestrator `pe_user` was not configured on the development PC, so the live mutation was executed through the packaged v1.5.5 ZTF container with a temporary `global.yml`; the validated repo changes are being released as v1.5.6.
- Orchestrator-specific behaviour was validated through dry-run preflight, destructive-action API tests, schema-contract tests, release-integrity tests, build, and visual smoke.
- The temporary credential file was redacted after the live run and was not committed.

Observed results:

- Pre-create Prism inventory: target container absent; storage container count `3`.
- First create attempt: ZTF reached Prism Element, but Prism rejected `replication_factor: 2` because DEV_LAB is a one-node cluster.
- Second create attempt with `replication_factor: 1`: ZTF reported successful creation and verification `PASS`.
- Post-create Prism inventory: target container present once with `replication_factor: 1`; storage container count `4`.
- Delete attempt with `replication_factor: 1`: ZTF reported successful deletion and verification `PASS`.
- Post-delete Prism inventory: target container absent; storage container count `3`.

Additional runtime discovery:

- ZTF expects the `ipam` key to exist in `global.yml` even when `ip_allocation_method: static`; omitting `ipam` produced an early ZTF `'ipam'` error before the container operation.

### Live DEV_LAB Prism Central Deployment And Registration

On 2026-07-24, the lab was redeployed and the Prism Central deployment path was
validated through the ZTF-Orchestrator job runner.

Observed results:

- `DeployPC` completed successfully for Prism Central `pc.2024.3.1.14`.
- Prism Central became available on the configured lab VIP and reported
  `pc.2024.3.1.14`.
- The CE dual-stack IPv6 blocker was remediated before registration. After
  remediation, `manage_ipv6 show` reported `gateway: null`, `prefixlen: null`,
  and `svmips`/`hostips` set to `null`; `ip -6 addr` and `ip -6 route` returned
  no active IPv6 configuration.
- `RegisterToPc` was executed through ZTF-Orchestrator with the lab PE and PC
  credential references. The job completed with return code `0`.
- ZTF verification returned:

```text
{'clusters': {'10.20.30.201': {'Register_to_PC': 'PASS'}}}
```

Additional PC-backed validation:

- `CreateCategoryPc` reached Prism Central, authenticated, and read categories
  successfully with HTTP `200`.
- The category value mutation path failed twice because Prism Central returned
  `503 SERVICE UNAVAILABLE` from:

```text
POST /api/prism/v4.0/operations/$actions/batch
```

This keeps `CreateCategoryPc` out of the completed validation list. The failure
is recorded as a Prism Central v4 batch service-readiness limitation in this lab
because authentication and read access succeeded.

### Live Orchestrator-Run Container Lifecycle

On 2026-07-24, after the PE and PC redeploy, the disposable storage-container
lifecycle was rerun through the ZTF-Orchestrator job API rather than a temporary
standalone ZTF container.

Observed results:

- `CreateContainerPe` created `ztf_validation_container_20260724` with
  `replication_factor: 1` and ZTF verification returned:

```text
{'clusters': {'10.20.30.201': {'Create_container': {'ztf_validation_container_20260724': 'PASS'}}}}
```

- `DeleteContainerPe` was rejected on the first submission without destructive
  acknowledgement.
- `DeleteContainerPe` was rerun with the required confirmation phrase
  `RUN DeleteContainerPe` and ZTF verification returned:

```text
{'clusters': {'10.20.30.201': {'Delete_container': {'ztf_validation_container_20260724': 'PASS'}}}}
```

This validates both the Orchestrator destructive-action gate and the live PE
create/delete execution path.

### Automated Checks

Latest successful checks:

```powershell
python -m pytest -q
# 215 passed, 1 skipped

python -m pytest tests/test_release_integrity.py -q
# 11 passed

python -m pytest tests/test_api.py -q -k "preflight or dry_run or diagnostics or destructive"
# 17 passed, 143 deselected

npm run build
# passed

$env:ZTF_VISUAL_BASE_URL='http://127.0.0.1:5173'; npm run smoke:visual
# 10 passed
```

Visual smoke now covers:

- all script wizard examples generate parseable YAML with required-field guidance
- all PE script wizard examples emit runtime-compatible `clusters.<pe_ip>.name`
- PE delete wizard examples include ZTF schema-required companion fields
- `DeleteContainerPe` wizard metadata marks the lifecycle cleanup as destructive
- login rendering
- theme toggle and appliance navigation
- workflow card readability
- PE wizard cluster-name YAML
- PE role-mapping schema-valid YAML
- main-page light-theme text contrast

## Remaining Gated Validation

The following items are intentionally not complete because they require persistent Orchestrator credentials, additional lab assets, or packaging work:

1. Upload/provide a Prism Element image before a VM lifecycle test.
2. Recheck Prism Central v4 batch operation service health before rerunning
   PC mutation scripts such as `CreateCategoryPc`.
3. Rebuild the container image and regenerate the offline upgrade package after final validation changes are committed.

### Recommended Gated Mutation Path

Detailed runbook: `docs/dev-lab-disposable-container-runbook.md`

DEV_LAB currently has `0` images, so a VM lifecycle test is not the best first mutation. The safest practical ZTF validation path is a temporary storage-container create/delete lifecycle:

Disposable target:

- Container name: `ztf-orchestrator-validation-container`
- Prism Element endpoint: `10.20.30.201`
- Cluster name: `DEV_LAB`
- Replication factor: `1` for DEV_LAB's one-node cluster
- Advertised capacity: `16 GiB`

Create YAML:

```yaml
clusters:
  10.20.30.201:
    name: DEV_LAB
    pe_credential: pe_user
    containers:
      - name: ztf-orchestrator-validation-container
        replication_factor: 1
        advertisedCapacity_in_gb: 16
```

Delete YAML:

```yaml
clusters:
  10.20.30.201:
    name: DEV_LAB
    pe_credential: pe_user
    containers:
      - name: ztf-orchestrator-validation-container
        replication_factor: 1
```

Note: `DeleteContainerPe` deletes by container name at runtime, but the shared ZTF PE schema still requires `replication_factor` for `containers` entries before execution starts.

Expected proof points:

- Pre-create inventory confirms the disposable container is absent.
- `CreateContainerPe` execution completes successfully with a replication factor valid for the target cluster.
- Post-create inventory confirms the disposable container exists.
- `DeleteContainerPe` execution completes successfully.
- Post-delete inventory confirms the disposable container is absent.
- Orchestrator execution history shows exact command, config file, return code, stdout/stderr, diagnostics, and likely fix behavior for failures.

Alternative VM lifecycle path:

- VM name: `ztf-orchestrator-validation-001`
- Network: `MGMT_VLAN`
- Storage container: `SelfServiceContainer`
- Image: required before a VM lifecycle test can run

Do not run the disposable VM lifecycle until the lab owner explicitly approves object creation, power actions, and deletion.
