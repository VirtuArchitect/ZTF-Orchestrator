# DEV_LAB Disposable Container Validation Runbook

Date: 2026-07-22

Purpose: validate ZTF-Orchestrator v1.5.6 against the DEV_LAB Prism Element cluster with a low-impact create/delete lifecycle after explicit lab-owner approval.

This runbook intentionally uses a temporary storage container instead of a VM because the latest read-only DEV_LAB inventory showed `0` Prism images.

## Scope

- Prism Element API endpoint: `10.20.30.201:9440`
- Cluster name: `DEV_LAB`
- Disposable container: `ztf-orchestrator-validation-container`
- Replication factor: `1` for the one-node DEV_LAB cluster
- Advertised capacity: `16 GiB`

Do not run this lifecycle unless object creation and deletion have been explicitly approved.

## Preconditions

1. Confirm `pe_user` exists in Orchestrator Global Config and has Prism Element rights to create and delete storage containers.
2. Confirm `ztf-orchestrator-validation-container` is absent.
3. Confirm Prism Element API reachability on `10.20.30.201:9440`.
4. Confirm the operator understands the delete confirmation phrase: `RUN DeleteContainerPe`.

## Create YAML

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

## Delete YAML

```yaml
clusters:
  10.20.30.201:
    name: DEV_LAB
    pe_credential: pe_user
    containers:
      - name: ztf-orchestrator-validation-container
        replication_factor: 1
```

Note: ZTF deletes the PE container by `name`, but its shared `containers` schema still requires `replication_factor` before script execution starts. Use `1` for DEV_LAB because Prism Element rejects RF2 on this one-node cluster.

## Dry-Run Validation

Run dry-run first for both scripts. Dry-run performs Orchestrator preflight only and does not launch the ZTF subprocess.

Expected current results:

- `CreateContainerPe`: `4 passed, 0 failed`
- `DeleteContainerPe`: `6 passed, 0 failed`

Dry-run proof points:

- YAML is parseable.
- top-level `clusters` exists.
- `clusters.10.20.30.201.name` exists.
- `DeleteContainerPe` item fields `containers[0].name` and `containers[0].replication_factor` exist.
- Prism Element `10.20.30.201:9440` is reachable.

## Execution Payloads

Use the Orchestrator UI where possible so execution history, diagnostics, and evidence are captured naturally. If using the API, authenticate first and send the same payload shape.

Create payload:

```json
{
  "script": "CreateContainerPe",
  "configFile": "dev-lab-create-validation-container.yml",
  "configContent": "clusters:\n  10.20.30.201:\n    name: DEV_LAB\n    pe_credential: pe_user\n    containers:\n      - name: ztf-orchestrator-validation-container\n        replication_factor: 1\n        advertisedCapacity_in_gb: 16\n"
}
```

Delete payload:

```json
{
  "script": "DeleteContainerPe",
  "configFile": "dev-lab-delete-validation-container.yml",
  "configContent": "clusters:\n  10.20.30.201:\n    name: DEV_LAB\n    pe_credential: pe_user\n    containers:\n      - name: ztf-orchestrator-validation-container\n        replication_factor: 1\n",
  "riskAcknowledged": true,
  "destructiveConfirmation": "RUN DeleteContainerPe"
}
```

## Required Evidence

Capture the following evidence before calling the lifecycle complete:

1. Pre-create inventory: disposable container is absent.
2. `CreateContainerPe` execution record:
   - exact command
   - config file
   - return code
   - stdout/stderr
   - diagnostics if failed
3. Post-create inventory: disposable container is present.
4. `DeleteContainerPe` execution record:
   - exact command
   - config file
   - return code
   - stdout/stderr
   - diagnostics if failed
5. Post-delete inventory: disposable container is absent.
6. Validation report updated with timestamps and results.

## Stop Conditions

Stop and do not proceed to delete until reviewed if:

- The create script fails with an unknown error.
- The container appears with unexpected properties.
- Orchestrator history lacks command/config/stdout/stderr evidence.
- Any Prism API response suggests a task is still running or partially failed.

If create succeeds but delete fails, preserve all evidence, manually verify the container state in Prism Element, and clean up only after confirming the target object name exactly matches `ztf-orchestrator-validation-container`.

## Live DEV_LAB Result

Approved by the lab owner on 2026-07-22:

- `CreateContainerPe` followed by `DeleteContainerPe` for `ztf-orchestrator-validation-container`.

Observed sequence:

- Pre-create Prism inventory: target container absent; storage container count `3`.
- First create attempt with `replication_factor: 2`: ZTF reached Prism Element but Prism rejected the request because RF2 is invalid on this one-node cluster.
- Second create attempt with `replication_factor: 1`: ZTF reported `Creation of Storage container ztf-orchestrator-validation-container successful!` and verification `PASS`.
- Post-create Prism inventory: target container present once with `replication_factor: 1`; storage container count `4`.
- Delete attempt with `replication_factor: 1`: ZTF reported `Deletion of Storage container ztf-orchestrator-validation-container successful!` and verification `PASS`.
- Post-delete Prism inventory: target container absent; storage container count returned to `3`.

Temporary credential/config files were not committed. The transient credential file was redacted after the run.
