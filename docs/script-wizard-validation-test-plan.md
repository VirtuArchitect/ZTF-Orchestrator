# Script Wizard Validation Test Plan

## Purpose

Validate that every ZTF-Orchestrator script wizard schema generates YAML that
matches real ZeroTouch Framework v1.5.2 behavior when executed through
ZTF-Orchestrator v1.5.5.

This plan covers all 75 scripts in the ZTF-Orchestrator script catalogue. The
goal is not only to confirm that the UI generates YAML, but also to prove that
the generated YAML is accepted by the bundled ZTF runtime and produces the
expected Prism, NDB, NKE, Objects, or CVM-side behavior.

## Scope

In scope:

- Wizard field rendering for every script.
- Required-field validation in the UI.
- Generated YAML structure and key names.
- Successful execution through ZTF-Orchestrator job submission.
- Runtime behavior against authorized lab infrastructure.
- Failure behavior for invalid or missing inputs.
- Audit/history/evidence capture.

Out of scope:

- Unauthorized testing against third-party infrastructure.
- Performance/load testing.
- Upstream ZTF v2.x IaC behavior.
- Full destructive testing in production.

## Test Environments

Use at least one non-production Nutanix lab with the following coverage:

- Prism Central reachable from the appliance.
- At least one Prism Element cluster registered or reachable.
- A safe AHV network/subnet for VM tests.
- A safe storage container for VM/image tests.
- Test credentials stored in ZTF-Orchestrator global config.
- Test AD/LDAP/SAML endpoints if authentication scripts are validated.
- Optional but recommended:
  - NKE-capable cluster.
  - NDB test endpoint.
  - Objects-enabled lab.
  - Remote Prism Central for DR/Availability Zone tests.
  - Test CVM access for Foundation update validation.

Do not run destructive scripts against production assets. Use disposable test
objects with a clear prefix, for example `ztf-wizard-test-*`.

## Preconditions

Before starting validation:

1. Deploy ZTF-Orchestrator v1.5.5 with the latest offline package.
2. Confirm `/health` returns `healthy`.
3. Confirm the UI footer reports `ZeroTouch Orchestrator v1.5.5`.
4. Confirm the bundled ZTF runtime is installed and compatible.
5. Configure global credentials:
   - `pc_user`
   - `pe_user`
   - `cvm_credential`
   - `service_account_credential`
   - Any script-specific credential refs.
6. Create a validation evidence folder:

```text
validation/YYYY-MM-DD-script-wizard-v1.5.5/
```

7. For every test, capture:
   - Script ID.
   - Generated YAML.
   - Execution ID/job ID.
   - Start and finish timestamps.
   - Result status.
   - Relevant Prism/API verification.
   - Cleanup status.
   - Screenshot for UI failures.

## Common Validation Flow

Run this flow for each script unless the matrix says otherwise.

1. Open `Scripts`.
2. Select the script.
3. Confirm the `Config Wizard` appears for the selected script.
4. Leave required fields empty and confirm `Generate YAML` is disabled.
5. Populate fields with lab-safe values.
6. Generate YAML.
7. Save the generated YAML as a config file with this name pattern:

```text
wizard-<script-id>-<date>-<case>.yml
```

8. Review the YAML:
   - Top-level keys match ZTF examples or script contract.
   - Credential refs are refs, not raw passwords.
   - No placeholder values remain.
   - Destructive scripts target disposable objects only.
9. Submit the script through ZTF-Orchestrator.
10. Confirm the execution reaches a terminal state.
11. Verify the external side effect in Prism/ZTF/API.
12. Capture execution logs and UI history.
13. Run cleanup where required.

## Pass/Fail Criteria

A script wizard passes when:

- The wizard renders for the script.
- Required-field validation works.
- Generated YAML parses as YAML.
- Generated YAML uses the expected ZTF keys and nesting.
- ZTF-Orchestrator accepts the script/config request.
- The ZTF runtime does not fail due to schema/key mismatch.
- The expected external behavior occurs, or a safe no-op/read-only behavior is
  observed for non-mutating actions.
- Cleanup succeeds or is documented as not applicable.

A script wizard fails when:

- The wizard is missing.
- Required fields are wrong or missing.
- Generated YAML contains incorrect key names.
- Generated YAML contains stale examples such as `test-payload`.
- ZTF runtime rejects the config shape.
- The script runs but acts on the wrong object.
- The UI reports success while the external system shows no expected change.
- Destructive script targets cannot be constrained safely.

## Evidence Template

Use this template for each validation record.

```markdown
## <Script ID> - <Case Name>

- Date:
- Tester:
- ZTF-Orchestrator version:
- Container image SHA:
- ZTF runtime ref:
- Environment:
- Script:
- Config file:
- Execution/job ID:
- Result:
- Generated YAML reviewed: yes/no
- External verification:
- Cleanup:
- Notes:
- Defects:
```

## Negative Test Set

Run these once per script family, not necessarily per script:

- Missing required PC IP.
- Missing credential ref.
- Invalid IP address format.
- Empty list where a list is required.
- Unknown cluster or network name.
- Duplicate object name.
- Unauthorized credential ref.
- Destructive action against a non-existent object.
- YAML manually edited to an invalid type, for example string instead of list.

Expected behavior:

- UI blocks obvious missing required fields.
- Runtime fails safely for invalid infrastructure values.
- Error is visible in execution details.
- No unrelated resource is modified.

## Script Validation Matrix

### Authentication

| Script | Positive validation | External verification | Cleanup |
| --- | --- | --- | --- |
| `AddAdServerPe` | Generate PE `directory_services` YAML and add AD config to a test PE cluster. | PE authentication/directory service entry exists. | Remove test directory service if supported. |
| `AddAdServerPc` | Generate `pc_directory_services` YAML and add AD config to PC. | PC directory service entry exists. | Remove test directory service if supported. |
| `CreateRoleMappingPe` | Generate role mapping under PE directory service. | Role mapping appears on PE. | Remove mapping. |
| `CreateRoleMappingPc` | Generate role mapping under PC directory service. | Role mapping appears on PC. | Remove mapping. |
| `CreateIdp` | Generate `saml_idp_configs` YAML using metadata URL/path. | SAML IDP appears in PC. | Remove test IDP. |
| `AddLocalUsers` | Generate `local_users` YAML for a disposable user. | Local user exists in PC IAM. | Delete user. |
| `ImportUsers` | Generate `users` YAML for LDAP/SAML users. | Imported users visible in PC IAM. | Remove imported test users if applicable. |
| `AddUserGroups` | Generate `user_groups` YAML. | Group is visible/usable in PC IAM. | Remove group if created. |
| `AddRoles` | Generate `roles` YAML with operations. | Role appears in PC IAM. | Delete role. |
| `AddDirectoryServices` | Generate Objects `directory_services` YAML. | Directory service appears in Objects context. | Remove test directory service. |

### Networking

| Script | Positive validation | External verification | Cleanup |
| --- | --- | --- | --- |
| `CreateSubnetPe` | Create AHV VLAN subnet on PE. | Subnet exists on target cluster. | Delete subnet. |
| `CreateSubnetsPc` | Create AHV VLAN subnet via PC on target cluster. | Subnet exists in PC/cluster. | Delete subnet. |
| `DeleteSubnetsPe` | Delete a disposable PE subnet by name. | Subnet no longer exists. | None. |
| `DeleteSubnetsPc` | Delete a disposable PC-managed subnet by name. | Subnet no longer exists. | None. |
| `CreateVPC` | Create disposable VPC. | VPC visible in PC networking. | Delete VPC. |
| `UpdateVPC` | Update description/routable IPs on disposable VPC. | VPC fields reflect update. | Restore/delete VPC. |
| `DeleteVPC` | Delete disposable VPC. | VPC no longer exists. | None. |
| `EnableNetworkController` | Enable network controller in lab PC. | Network controller status enabled. | Disable only if safe. |
| `DisableNetworkController` | Disable only in disposable lab where approved. | Network controller status disabled. | Re-enable if required. |
| `AddNameServersPe` | Add DNS servers to PE cluster. | PE DNS list contains test servers. | Restore original DNS list. |
| `AddNameServersPc` | Add DNS servers to PC. | PC DNS list contains test servers. | Restore original DNS list. |
| `AddNtpServersPe` | Add NTP servers to PE cluster. | PE NTP list contains test servers. | Restore original NTP list. |
| `AddNtpServersPc` | Add NTP servers to PC. | PC NTP list contains test servers. | Restore original NTP list. |

### Storage

| Script | Positive validation | External verification | Cleanup |
| --- | --- | --- | --- |
| `CreateContainerPe` | Create disposable storage container. | Container exists with expected RF/compression settings. | Delete container. |
| `DeleteContainerPe` | Delete disposable storage container. | Container no longer exists. | None. |
| `CreateObjectStore` | Create test object store if lab supports Objects. | Object store appears healthy or provisioning. | Delete object store. |
| `DeleteObjectStore` | Delete disposable object store. | Object store no longer exists. | None. |
| `CreateBucket` | Create bucket in disposable object store. | Bucket exists. | Delete bucket/object store. |
| `ShareBucket` | Add user access list to bucket. | Bucket permissions include test users. | Remove permissions. |

### Compute

| Script | Positive validation | External verification | Cleanup |
| --- | --- | --- | --- |
| `CreateVmPe` | Create disposable PE VM from test image. | VM exists with requested CPU, memory, NIC, and name. | Delete VM. |
| `CreateVmsPc` | Create disposable PC VM and confirm name is not `test-payload`. | VM exists with requested name, image, network, CPU, memory. | Delete VM. |
| `DeleteVmPe` | Delete disposable PE VM. | VM no longer exists. | None. |
| `DeleteVmPc` | Delete disposable PC VM. | VM no longer exists. | None. |
| `PowerTransitionVmPe` | Power on/off disposable PE VM. | VM power state changes. | Restore desired power state. |
| `PowerOnVmPc` | Power on disposable PC VM. | VM power state is ON. | Power off/delete VM. |

### Images

| Script | Positive validation | External verification | Cleanup |
| --- | --- | --- | --- |
| `UploadImagePe` | Upload small test disk/ISO image to PE. | Image exists on PE/container. | Delete image manually if no script exists. |
| `PcImageUpload` | Upload small test image to PC. | Image exists in PC image catalogue. | Delete image. |
| `PcOVAUpload` | Upload small test OVA to PC. | OVA/image appears in PC catalogue. | Delete OVA/image. |
| `PcImageDelete` | Delete disposable PC image. | Image no longer exists. | None. |
| `PcOVADelete` | Delete disposable OVA. | OVA no longer exists. | None. |

### Security

| Script | Positive validation | External verification | Cleanup |
| --- | --- | --- | --- |
| `CreateNetworkSecurityPolicy` | Create Flow policy with test category target. | Policy exists and is MONITOR/APPLY as requested. | Delete policy. |
| `DeleteNetworkSecurityPolicy` | Delete disposable Flow policy. | Policy no longer exists. | None. |
| `CreateAddressGroups` | Create address group with test subnet/range. | Address group exists. | Delete group. |
| `DeleteAddressGroups` | Delete disposable address group. | Group no longer exists. | None. |
| `CreateServiceGroups` | Create service group with test TCP/UDP/ICMP entries. | Service group exists. | Delete group. |
| `DeleteServiceGroups` | Delete disposable service group. | Group no longer exists. | None. |
| `CreateCategoryPc` | Create category and value. | Category/value exists. | Delete category/value. |
| `DeleteCategoryPc` | Delete disposable category or value. | Category/value no longer exists. | None. |

### Kubernetes

| Script | Positive validation | External verification | Cleanup |
| --- | --- | --- | --- |
| `CreateKarbonClusterPc` | Generate and submit NKE cluster config in NKE lab. | NKE cluster appears/provisions with requested cluster type and subnet. | Delete NKE cluster. |
| `EnableNke` | Enable NKE service in PC lab. | NKE service status enabled. | Leave enabled or disable manually per lab policy. |

### Database

| Script | Positive validation | External verification | Cleanup |
| --- | --- | --- | --- |
| `NdbConfig` | Generate NDB config and deploy/configure against NDB lab. | NDB VM/config/profiles appear as expected. | Remove disposable NDB objects. |
| `RegisterInitClusterNdb` | Register a disposable/test cluster with NDB. | Cluster is visible in NDB. | Unregister cluster. |

### Prism Central

| Script | Positive validation | External verification | Cleanup |
| --- | --- | --- | --- |
| `DeployPC` | Deploy PC only in isolated lab with approved resources. | PC VM(s) deployed with VIP/IPs. | Destroy lab PC if required. |
| `RegisterToPc` | Register PE cluster to PC. | Cluster appears in PC. | Unregister only if lab requires cleanup. |
| `EnableMicrosegmentation` | Enable Flow/microsegmentation in lab PC. | Microsegmentation status enabled. | Leave enabled or disable per lab policy. |
| `DisableMicrosegmentation` | Disable only in approved lab. | Microsegmentation status disabled. | Re-enable if needed. |
| `EnableObjects` | Enable Objects service. | Objects service enabled. | Leave enabled unless lab cleanup requires removal. |
| `EnableDR` | Enable DR service. | DR service enabled. | Leave enabled or document cleanup. |
| `CreateProtectionPolicy` | Create protection policy using disposable category/VMs. | Policy exists and schedule is correct. | Delete policy. |
| `DeleteProtectionPolicy` | Delete disposable protection policy. | Policy no longer exists. | None. |
| `CreateRecoveryPlan` | Create recovery plan using disposable category/network mapping. | Recovery plan exists. | Delete plan. |
| `DeleteRecoveryPlan` | Delete disposable recovery plan. | Plan no longer exists. | None. |
| `ConnectToAz` | Connect remote AZ to lab PC. | Remote AZ appears connected. | Disconnect AZ. |
| `DisconnectAz` | Disconnect test remote AZ. | Remote AZ no longer connected. | Reconnect if needed. |
| `EnableFC` | Enable Foundation Central in lab PC. | FC status enabled. | Leave enabled or document cleanup. |
| `GenerateFcApiKey` | Generate FC API key with test alias. | Key generated and stored/visible according to ZTF behavior. | Revoke/delete key if supported. |
| `EnableMarketplace` | Enable Marketplace in lab PC. | Marketplace status enabled. | Leave enabled or document cleanup. |

### Prism Element

| Script | Positive validation | External verification | Cleanup |
| --- | --- | --- | --- |
| `AcceptEulaPe` | Submit EULA config on disposable/lab PE. | EULA accepted. | Not reversible. Use lab only. |
| `AcceptEulaPc` | Submit EULA config on lab PC. | EULA accepted. | Not reversible. Use lab only. |
| `UpdatePulsePe` | Toggle Pulse setting on PE. | Pulse setting matches requested value. | Restore original value. |
| `UpdatePulsePc` | Toggle Pulse setting on PC. | Pulse setting matches requested value. | Restore original value. |
| `HaReservation` | Set HA reservation in lab cluster. | HA reservation matches requested values. | Restore original HA setting. |
| `RebuildCapacityReservation` | Set rebuild capacity reservation. | Reservation setting matches requested value. | Restore original setting. |
| `UpdateDsip` | Set DSIP to explicit lab IP or IPAM-derived value. | DSIP updated and reachable as expected. | Restore previous DSIP if required. |

### System

| Script | Positive validation | External verification | Cleanup |
| --- | --- | --- | --- |
| `UpdateCvmFoundation` | Run only against disposable/lab CVM with approved Foundation tar. | CVM Foundation version updates or script reports expected no-op. | Restore/downgrade only if approved. |

## Destructive Script Safety Gate

Before running any delete, disable, disconnect, power, or update script:

1. Confirm the target object has the `ztf-wizard-test-*` prefix or is approved
   in writing.
2. Capture current state.
3. Confirm rollback or recreation steps.
4. Use a second reviewer for:
   - `Delete*`
   - `Disable*`
   - `DisconnectAz`
   - `UpdateCvmFoundation`
   - `UpdateDsip`
   - `DeployPC`
5. Attach approval evidence to the execution record.

## Defect Severity

Use these severities:

- Critical: Wizard can target the wrong object, leaks secrets, or destructive
  script can run without a safe target.
- High: Generated YAML is accepted but causes incorrect infrastructure changes.
- Medium: Generated YAML fails due to wrong key/shape.
- Low: Label, help text, placeholder, or optional field issue.

## Completion Criteria

Validation is complete when:

- All 75 scripts have a pass/fail record.
- All destructive scripts have approval evidence.
- All failed scripts have linked defects.
- All cleanup actions are complete or explicitly deferred.
- A summary report lists:
  - Passed scripts.
  - Failed scripts.
  - Blocked scripts.
  - Not-applicable scripts.
  - Residual risks.

## Recommended Automation Follow-Up

After manual validation, add automated coverage in phases:

1. Unit tests for each schema builder using representative values.
2. YAML parse tests for every generated config.
3. Contract tests comparing top-level keys against bundled ZTF example configs.
4. Mock ZTF execution tests to verify command submission per script.
5. Optional live functional tests gated behind explicit environment variables.
