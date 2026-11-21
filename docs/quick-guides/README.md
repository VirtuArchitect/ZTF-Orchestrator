# Workflow and Script Quick Guides

Easy-to-follow task guides using the ZTF documentation structure and the maintained Word/PDF manual style. Reviewed **20 November 2026** against source `79c3ecc`. These are source-reviewed procedures, not live hardware validation or an appliance update.

**Start with [Using the quick guides](using-the-guides.md)** for credentials, approvals, Dry Run limits, job monitoring and safe recovery.

Coverage: **30 current workflows, 79 scripts and 8 dedicated operations**, plus **16 retired reference entries**. The [coverage manifest](coverage.json) records every ID. Repository development, test and packaging helpers are outside this operator catalogue.

## Corrected ZTF cover and format

The editions dated **21 November 2026** restore the original ZTF Operational
Quick Guides cover, Letter-page layout, Arial typography, Team Operational
Quick Guides header, versioned page footer and navy tables. Procedures, guide
IDs and all 117 simulated task screenshots are retained. Source review remains
20 November 2026 at `79c3ecc`; this is a format correction.

- [Corrected illustrated PDF — 308 pages](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Illustrated-Branded.pdf) · [editable Word](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Illustrated-Branded.docx)
- [Corrected screenshot companion PDF — 123 pages](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Screenshots-Branded.pdf) · [editable Word companion](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Screenshots-Branded.docx)
- [Corrected text PDF — 191 pages](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Branded.pdf) · [editable Word text edition](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Branded.docx)
- [Cover preview](../assets/quick-guides/branding/cover-preview.png), [format reference](../assets/quick-guides/branding/README.md), [checksums](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Branded-SHA256SUMS.txt) and [branding manifest](../manuals/workflow-script-quick-guides-branding.json)

All previous Word/PDF editions and the original PNG screenshot ZIP remain
available below and are unchanged by this correction.

## Previous illustrated edition and screenshots

All **117 current tasks** now have matching light-mode screenshots from the
isolated source demo, visibly labelled as simulated. Each individual guide links
its image. Required inputs can be incomplete; screenshots show authoring or the
initial screen, not a successful run or target preflight. Retired entries have no
current execution screenshots.

- [Illustrated collection PDF — 279 pages](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Illustrated.pdf)
- [Editable illustrated Word collection](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Illustrated.docx)
- [Screenshot companion PDF — 122 pages](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Screenshots.pdf)
- [All 117 full-resolution PNGs and offline gallery ZIP](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Screenshots.zip)
- [Browse the screenshot gallery](../assets/quick-guides/2026-11-20/gallery.html)
- [Screenshot provenance](../assets/quick-guides/2026-11-20/README.md), [file checksums](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Screenshots-SHA256SUMS.txt) and [edition manifest](../manuals/workflow-script-quick-guides-screenshots.json)

## Original text edition

Download the complete collection: [PDF](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides.pdf) · [editable Word](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides.docx). Use the links below for individual guides.

The collection is **162 pages** with linked contents. [Checksums](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-SHA256SUMS.txt),
[collection manifest](../manuals/workflow-script-quick-guides-collection.json) and
[validation record](VALIDATION.md) accompany the downloads.

v1.8.5-rc1 remains prerelease; compare the installed build and exact package with [current status](../current-status.md). Retired Native, NKP and ZTF 2.x console execution must not be followed from historical examples.

## Dedicated operations

- [AHV Uplink Migration](operations/ahv-uplink-migration.md) — `ahv-uplink-migration`
- [Enable Data at Rest Encryption](operations/dare.md) — `dare`
- [Change Virtual Switch MTU](operations/change-virtual-switch-mtu.md) — `change-virtual-switch-mtu`
- [Post Deployment Checks and Sequence](operations/post-deployment.md) — `post-deployment`
- [Run a Reviewed Pipeline](operations/pipelines.md) — `pipelines`
- [Recover Infrastructure and Resume Recovery](operations/recover-infrastructure.md) — `recover-infrastructure`
- [Guided Appliance Update](operations/guided-appliance-update.md) — `guided-appliance-update`
- [Upgrade Risk Advisor](operations/upgrade-advisor.md) — `upgrade-advisor`

## Current workflows

- [Initial Host & CVM Password Setup](workflows/initial-host-cvm-password-setup.md) — `initial-host-cvm-password-setup`
- [Cluster Storage Standard](workflows/cluster-storage-standard.md) — `cluster-storage-standard`
- [Unregister PE from PC](workflows/unregister-pe-from-pc.md) — `unregister-pe-from-pc`
- [CVM & iDRAC Password Rotation](workflows/cvm-idrac-password-rotation.md) — `cvm-idrac-password-rotation`
- [Cluster Create](workflows/cluster-create.md) — `cluster-create`
- [Cluster Create (Standalone FCA)](workflows/cluster-create-standalone-fca.md) — `cluster-create-standalone-fca`
- [Cluster Create (Foundation VM)](workflows/cluster-create-foundation-vm.md) — `cluster-create-foundation-vm`
- [Imaging Only](workflows/imaging-only.md) — `imaging-only`
- [Imaging Only (Standalone FCA)](workflows/imaging-only-standalone-fca.md) — `imaging-only-standalone-fca`
- [Pod Imaging](workflows/imaging.md) — `imaging`
- [Pod Imaging (Standalone FCA)](workflows/imaging-standalone-fca.md) — `imaging-standalone-fca`
- [Site Deploy](workflows/site-deploy.md) — `site-deploy`
- [Site Deploy (Standalone FCA)](workflows/site-deploy-standalone-fca.md) — `site-deploy-standalone-fca`
- [Native Foundation Deploy](workflows/native-foundation-deploy.md) — `native-foundation-deploy`
- [Configure Cluster](workflows/config-cluster.md) — `config-cluster`
- [Post-Foundation Baseline](workflows/post-foundation-baseline.md) — `post-foundation-baseline`
- [PE Monitoring Baseline](workflows/pe-monitoring-baseline.md) — `pe-monitoring-baseline`
- [AHV Security Hardening](workflows/pe-security-hardening.md) — `pe-security-hardening`
- [PE Network Baseline](workflows/pe-network-baseline.md) — `pe-network-baseline`
- [PE Certificate Baseline](workflows/pe-certificate-baseline.md) — `pe-certificate-baseline`
- [Hardware OOB Baseline](workflows/hardware-out-of-band-baseline.md) — `hardware-out-of-band-baseline`
- [Deploy Prism Central](workflows/deploy-pc.md) — `deploy-pc`
- [Configure Prism Central](workflows/config-pc.md) — `config-pc`
- [Pod Config](workflows/pod-config.md) — `pod-config`
- [Deploy Management PC](workflows/deploy-management-pc.md) — `deploy-management-pc`
- [Configure Management PC](workflows/config-management-pc.md) — `config-management-pc`
- [Calm VM Workloads](workflows/calm-vm-workloads.md) — `calm-vm-workloads`
- [Edge AI Workload](workflows/calm-edgeai-vm-workload.md) — `calm-edgeai-vm-workload`
- [NDB Deploy](workflows/ndb.md) — `ndb`
- [LCM Update](workflows/lcm-update.md) — `lcm-update`

## Scripts by category

### Authentication

- [Add AD Server (PE)](scripts/AddAdServerPe.md) — `AddAdServerPe`
- [Add AD Server (PC)](scripts/AddAdServerPc.md) — `AddAdServerPc`
- [Create Role Mapping (PE)](scripts/CreateRoleMappingPe.md) — `CreateRoleMappingPe`
- [Create Role Mapping (PC)](scripts/CreateRoleMappingPc.md) — `CreateRoleMappingPc`
- [Create SAML IDP (PC)](scripts/CreateIdp.md) — `CreateIdp`
- [Add Local Users (PC)](scripts/AddLocalUsers.md) — `AddLocalUsers`
- [Create Local Users (PE)](scripts/CreateLocalUsersPe.md) — `CreateLocalUsersPe`
- [Import Users (PC)](scripts/ImportUsers.md) — `ImportUsers`
- [Add User Groups (PC)](scripts/AddUserGroups.md) — `AddUserGroups`
- [Add Roles (PC)](scripts/AddRoles.md) — `AddRoles`
- [Add Directory Services (PC)](scripts/AddDirectoryServices.md) — `AddDirectoryServices`

### Networking

- [Create Subnet (PE)](scripts/CreateSubnetPe.md) — `CreateSubnetPe`
- [Create Subnets (PC)](scripts/CreateSubnetsPc.md) — `CreateSubnetsPc`
- [Delete Subnets (PE)](scripts/DeleteSubnetsPe.md) — `DeleteSubnetsPe`
- [Delete Subnets (PC)](scripts/DeleteSubnetsPc.md) — `DeleteSubnetsPc`
- [Create VPC (PC)](scripts/CreateVPC.md) — `CreateVPC`
- [Update VPC (PC)](scripts/UpdateVPC.md) — `UpdateVPC`
- [Delete VPC (PC)](scripts/DeleteVPC.md) — `DeleteVPC`
- [Enable Network Controller (PC)](scripts/EnableNetworkController.md) — `EnableNetworkController`
- [Disable Network Controller (PC)](scripts/DisableNetworkController.md) — `DisableNetworkController`
- [Add DNS Servers (PE)](scripts/AddNameServersPe.md) — `AddNameServersPe`
- [Add DNS Servers (PC)](scripts/AddNameServersPc.md) — `AddNameServersPc`
- [Add NTP Servers (PE)](scripts/AddNtpServersPe.md) — `AddNtpServersPe`
- [Add NTP Servers (PC)](scripts/AddNtpServersPc.md) — `AddNtpServersPc`

### Storage

- [Create Storage Container (PE)](scripts/CreateContainerPe.md) — `CreateContainerPe`
- [Delete Storage Container (PE)](scripts/DeleteContainerPe.md) — `DeleteContainerPe`
- [Create Object Store (PC)](scripts/CreateObjectStore.md) — `CreateObjectStore`
- [Delete Object Store (PC)](scripts/DeleteObjectStore.md) — `DeleteObjectStore`
- [Create Bucket (PC)](scripts/CreateBucket.md) — `CreateBucket`
- [Share Bucket (PC)](scripts/ShareBucket.md) — `ShareBucket`

### Compute

- [Create VM (PE)](scripts/CreateVmPe.md) — `CreateVmPe`
- [Create VMs (PC)](scripts/CreateVmsPc.md) — `CreateVmsPc`
- [Delete VM (PE)](scripts/DeleteVmPe.md) — `DeleteVmPe`
- [Delete VM (PC)](scripts/DeleteVmPc.md) — `DeleteVmPc`
- [Power Transition VM (PE)](scripts/PowerTransitionVmPe.md) — `PowerTransitionVmPe`
- [Power On VM (PC)](scripts/PowerOnVmPc.md) — `PowerOnVmPc`

### Images

- [Upload Image (PE)](scripts/UploadImagePe.md) — `UploadImagePe`
- [Upload Image (PC)](scripts/PcImageUpload.md) — `PcImageUpload`
- [Upload OVA (PC)](scripts/PcOVAUpload.md) — `PcOVAUpload`
- [Delete Image (PC)](scripts/PcImageDelete.md) — `PcImageDelete`
- [Delete OVA (PC)](scripts/PcOVADelete.md) — `PcOVADelete`

### Security

- [Create Security Policy (PC)](scripts/CreateNetworkSecurityPolicy.md) — `CreateNetworkSecurityPolicy`
- [Delete Security Policy (PC)](scripts/DeleteNetworkSecurityPolicy.md) — `DeleteNetworkSecurityPolicy`
- [Create Address Groups (PC)](scripts/CreateAddressGroups.md) — `CreateAddressGroups`
- [Delete Address Groups (PC)](scripts/DeleteAddressGroups.md) — `DeleteAddressGroups`
- [Create Service Groups (PC)](scripts/CreateServiceGroups.md) — `CreateServiceGroups`
- [Delete Service Groups (PC)](scripts/DeleteServiceGroups.md) — `DeleteServiceGroups`
- [Create Category (PC)](scripts/CreateCategoryPc.md) — `CreateCategoryPc`
- [Delete Category (PC)](scripts/DeleteCategoryPc.md) — `DeleteCategoryPc`

### Kubernetes

- [Create NKE Cluster (PC)](scripts/CreateKarbonClusterPc.md) — `CreateKarbonClusterPc`
- [Enable NKE (PC)](scripts/EnableNke.md) — `EnableNke`

### Database

- [Configure NDB](scripts/NdbConfig.md) — `NdbConfig`
- [Register NDB Cluster](scripts/RegisterInitClusterNdb.md) — `RegisterInitClusterNdb`

### Prism Central

- [Deploy Prism Central](scripts/DeployPC.md) — `DeployPC`
- [Unregister PE from PC](scripts/UnregisterPeFromPc.md) — `UnregisterPeFromPc`
- [Register PE to PC](scripts/RegisterToPc.md) — `RegisterToPc`
- [Enable Microsegmentation (PC)](scripts/EnableMicrosegmentation.md) — `EnableMicrosegmentation`
- [Disable Microsegmentation (PC)](scripts/DisableMicrosegmentation.md) — `DisableMicrosegmentation`
- [Enable Objects (PC)](scripts/EnableObjects.md) — `EnableObjects`
- [Enable DR (PC)](scripts/EnableDR.md) — `EnableDR`
- [Create Protection Policy (PC)](scripts/CreateProtectionPolicy.md) — `CreateProtectionPolicy`
- [Delete Protection Policy (PC)](scripts/DeleteProtectionPolicy.md) — `DeleteProtectionPolicy`
- [Create Recovery Plan (PC)](scripts/CreateRecoveryPlan.md) — `CreateRecoveryPlan`
- [Delete Recovery Plan (PC)](scripts/DeleteRecoveryPlan.md) — `DeleteRecoveryPlan`
- [Connect Availability Zone (PC)](scripts/ConnectToAz.md) — `ConnectToAz`
- [Disconnect Availability Zone (PC)](scripts/DisconnectAz.md) — `DisconnectAz`
- [Enable Foundation Central (PC)](scripts/EnableFC.md) — `EnableFC`
- [Generate FC API Key](scripts/GenerateFcApiKey.md) — `GenerateFcApiKey`
- [Enable Marketplace (PC)](scripts/EnableMarketplace.md) — `EnableMarketplace`

### Prism Element

- [Set Prism Login Title (PE)](scripts/SetPrismLoginTitlePe.md) — `SetPrismLoginTitlePe`
- [Change Default Admin Password (PE)](scripts/ChangeDefaultAdminPasswordPe.md) — `ChangeDefaultAdminPasswordPe`
- [Accept EULA (PE)](scripts/AcceptEulaPe.md) — `AcceptEulaPe`
- [Accept EULA (PC)](scripts/AcceptEulaPc.md) — `AcceptEulaPc`
- [Update Pulse (PE)](scripts/UpdatePulsePe.md) — `UpdatePulsePe`
- [Update Pulse (PC)](scripts/UpdatePulsePc.md) — `UpdatePulsePc`
- [Set HA Reservation (PE)](scripts/HaReservation.md) — `HaReservation`
- [Set Rebuild Capacity (PE)](scripts/RebuildCapacityReservation.md) — `RebuildCapacityReservation`
- [Update DSIP (PE)](scripts/UpdateDsip.md) — `UpdateDsip`

### System

- [Update CVM Foundation](scripts/UpdateCvmFoundation.md) — `UpdateCvmFoundation`

## Retired entries for historical inspection

- [ZTF 2.x Prism Category](retired/workflow-ztf2-prism-category.md) — `workflow-ztf2-prism-category`
- [ZTF 2.x Project](retired/workflow-ztf2-project.md) — `workflow-ztf2-project`
- [ZTF 2.x Subnet Intent](retired/workflow-ztf2-subnet-intent.md) — `workflow-ztf2-subnet-intent`
- [ZTF 2.x Image Registration](retired/workflow-ztf2-image-registration.md) — `workflow-ztf2-image-registration`
- [ZTF 2.x VM Deployment](retired/workflow-ztf2-vm-deployment.md) — `workflow-ztf2-vm-deployment`
- [ZTF 2.x Security Groups](retired/workflow-ztf2-security-groups.md) — `workflow-ztf2-security-groups`
- [ZTF 2.x Protection Policy](retired/workflow-ztf2-protection-policy.md) — `workflow-ztf2-protection-policy`
- [ZTF 2.x Recovery Plan](retired/workflow-ztf2-recovery-plan.md) — `workflow-ztf2-recovery-plan`
- [Create Category (PC)](retired/script-ztf2-create-category-pc.md) — `script-ztf2-create-category-pc`
- [Create Project (PC)](retired/script-ztf2-create-project-pc.md) — `script-ztf2-create-project-pc`
- [Create Subnets (PC)](retired/script-ztf2-create-subnets-pc.md) — `script-ztf2-create-subnets-pc`
- [Upload Image (PC)](retired/script-ztf2-upload-image-pc.md) — `script-ztf2-upload-image-pc`
- [Create VMs (PC)](retired/script-ztf2-create-vms-pc.md) — `script-ztf2-create-vms-pc`
- [Create Security Groups (PC)](retired/script-ztf2-create-security-groups-pc.md) — `script-ztf2-create-security-groups-pc`
- [Create Protection Policy (PC)](retired/script-ztf2-create-protection-policy-pc.md) — `script-ztf2-create-protection-policy-pc`
- [Create Recovery Plan (PC)](retired/script-ztf2-create-recovery-plan-pc.md) — `script-ztf2-create-recovery-plan-pc`
