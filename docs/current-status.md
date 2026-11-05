# Current documentation and appliance build

Reviewed 2 November 2026 against merged application source `a3c9c79832efe4552cab5b208d5fbe49936dcbf8` (PR #149). The current consolidated offline appliance bundle is **v1.8.5-rc1-636f191**, built from commit `636f19177a913e6b1c21d1c13703000dd1e08a38`; its source tree matches that merge. v1.8.5-rc1 remains a prerelease and v1.8.4 remains Latest stable.

Operators have reported more than 20 successful AHV cluster deployments, including more than 10 production clusters, with pipeline post-configuration. This reported operational use is distinct from repository test evidence and does not certify every workflow, hardware combination or preview integration.

## Included operator changes

| Area | Current behavior | Procedure |
|---|---|---|
| Credential organization | Administrator-managed datacenter/cluster and shared-service labels; flat references and selected-vault lookup preserved | [Credential groups](credential-groups.md) |
| Configuration library | Shared group catalogue, purposes, search, inherited labels on new files/uploads, Ungrouped and shared views | [Config Files grouping](config-file-groups.md) |
| Workflow and pipeline selection | Cluster-aware saved-file selection, Show all files and retention of existing selections outside a filter | [User guide](user-guide.md) |
| Prism Element title | Set Prism Login Title (PE) script and pipeline action, or a separate title-only Configure Cluster configuration; strict TLS and read-back verification | [PE login title](pe-login-title.md) |
| Appliance updates | Explicit host-service bootstrap, guided upload/readiness/approval/install/verification; green completed, blue active, grey pending, red failed, amber interrupted stages | [Guided updates](guided-appliance-updates.md) |
| Sessions | Administrator-only sign-in inventory, activity/expiry, confirmed session revocation and audit | [Session management](session-management.md) |
| Recovery | Reviewed Foundation VM snapshots, governed imaging, initial-access bootstrap before independent PE health evidence, then post-configuration and acceptance | [Disaster Recovery](disaster-recovery.md) |

Credential and config groups are organizational labels, not access boundaries or automatic target/credential mappings. Their catalogue is separate from Disaster Recovery datacenter/profile records. Creating either type of group does not create the other.

## Apply the consolidated offline bundle

[Update ZIP](https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/v1.8.5-rc1/ztf-update-v1.8.5-rc1-636f191.zip) · [SHA-256 sidecar](https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/v1.8.5-rc1/ztf-update-v1.8.5-rc1-636f191.zip.sha256)

ZIP SHA-256: `6824c285cef93852f42bdfcc2b0d0651be9605dde018bb3e41fc6a53c2ff4ccf`.

1. Finish or reconcile active jobs, pipelines and recovery work. Retain an independently verified complete backup pair and rollback image.
2. If the host service is absent, follow the explicit one-time bootstrap in the ZIP's `host-service/README.md`. Import never executes the installer.
3. Open **Administration > Appliance Ops > Updates**. Review storage, upload the complete ZIP, check readiness, approve the exact version and apply.
4. Verify the running image and `/health` installed version tag are `v1.8.5-rc1-636f191`. Review preserved settings, credentials, configurations, pipelines and recovery records.
5. In Config Files, assign existing files deliberately. They start Ungrouped; labels never rewrite their YAML or execution references.

## Evidence and document scope

Required PR checks passed: 1,142 tests passed, 2 skipped and 81.39% coverage, with frontend build/audit successful. Package/host-service checksums, exact Docker archive tags, isolated image health/API and package import were verified. Local Docker cutover was healthy with persistent configuration hashes and records preserved. A target Linux appliance activation and recovery rehearsal remain separate operator verification.

The [PDF manual and editable source](manuals/README.md) retain their existing design. [Current screenshots](assets/guide/v1.8.5-rc1/README.md) use generic simulated data. Dated evidence, archived release documents and existing videos retain their original provenance; a documentation refresh neither modifies earlier ZIPs nor turns simulated media into live validation.

## Newer source capability

The [cluster-focused operations workspace](cluster-operations.md) adds managed
cluster records, persistent review items and explicit verified-HTTPS PE
observations. This source addition is not part of the existing 636f191 or 17aa3f2
appliance ZIPs. Existing runtime/deployment and immutable package evidence remain
separate from these new implementation and fixture checks.

Upgrade Advisor now includes [request-scoped PE/PC TLS verification controls](upgrade-advisor-tls.md). These are source changes after the 636f191 bundle; that immutable bundle does not contain them. Use the newly published consolidated update for this feature.

Recovery profile lifecycle management adds visible editing, blocking-run links, reversible archive/restore and guarded unused-profile deletion. See [Recovery profile management](recovery-profile-management.md). This source addition is not retroactively included in older immutable update ZIPs; use the consolidated bundle published with its merged PR.
