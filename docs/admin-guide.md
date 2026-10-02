# ZTF-Orchestrator Admin Guide

Current release marker: `v1.8.4`.

This guide is for administrators who install, configure, operate, govern, and
support ZTF-Orchestrator in a trusted internal environment. It covers the major
features, their administrative purpose, common use cases, operating boundaries,
and the screens admins should use during normal operations, controlled UAT,
incident recovery, and audit review.

ZTF-Orchestrator is an independent community operations layer for Nutanix
automation workflows. It is not affiliated with or supported by Nutanix.
Production use requires environment-specific validation, change approval,
backup planning, and operational signoff.

## Scope And Operating Model

ZTF-Orchestrator provides a browser-based control plane for preparing,
validating, executing, and auditing Nutanix automation work. It complements the
underlying automation engines and infrastructure APIs rather than replacing
them.

| Layer | Role |
|---|---|
| ZTF-Orchestrator | Admin console, RBAC, configuration authoring, approvals, schedules, queues, evidence, audit, and governance records. |
| ZeroTouch Framework 1.x | Legacy workflow and script execution engine for allowlisted Nutanix operations. |
| ZeroTouch Framework 2.x | Separate IaC plan/apply lane for governed desired-state changes. |
| NKP ZeroTouch Framework | Optional guided preparation lane for Nutanix Kubernetes Platform profiles and safe phases. |
| Prism Central, Prism Element, Foundation Central, FCA, NKP, and provider APIs | Target systems that perform infrastructure actions when approved and supported. |

Administrative responsibilities include:

- Installing and updating the Orchestrator.
- Selecting the correct storage backend.
- Managing users, roles, runtime paths, and governance settings.
- Defining global configuration, credentials, IPAM metadata, and provider
  references.
- Controlling workflow execution through approvals, queues, and schedules.
- Preserving audit records, validation evidence, and backup/restore posture.
- Maintaining clear boundaries between demo, lab, controlled UAT, and
  production-validated claims.

## Deployment Profiles

Choose the deployment model based on the team size, persistence needs, and
validation target.

| Deployment model | Best use case | Admin notes |
|---|---|---|
| Local workstation | Lab testing, demos, single-operator evaluation. | File-backed state is simple but should not be treated as shared production state. |
| Docker Compose with PostgreSQL | Small internal team deployment with durable state. | Recommended for governed team use because users, jobs, approvals, schedules, evidence, and audit records are durable. |
| AHV or VM appliance | Operationally packaged deployment for infrastructure teams. | Use appliance update and backup procedures; track Installed Build metadata. |
| Kubernetes starter manifests | Platform teams that want to adapt deployment into an existing cluster. | Treat manifests as starters and apply local hardening, ingress, TLS, and storage review. |
| Air-gapped deployment | Disconnected environments with internal Git/PyPI or prebuilt bundles. | Stage framework checkouts, Python wheels, update packages, images, checksums, and evidence exports separately. |

Use the Installation Guide for build and deployment commands. Use this Admin
Guide for what to configure and operate after installation.

## First-Time Admin Checklist

1. Install or deploy ZTF-Orchestrator using the selected deployment profile.
2. Confirm the app starts and `/health` reports healthy.
3. Sign in with the first-run admin credentials and rotate the password.
4. Configure storage and backup expectations before onboarding other users.
5. Configure ZTF 1.x, ZTF 2.x, and optional NKP runtime paths in Settings.
6. Confirm the Dashboard readiness indicators match the intended runtime.
7. Create named admin, operator, and viewer accounts.
8. Configure Global Config credential references, vault metadata, and IPAM
   metadata.
9. Create or import baseline YAML through YAML Studio or Config Files.
10. Define approval rules for governed or destructive work.
11. Run non-mutating validation or dry-run paths before approving live changes.
12. Capture Validation Evidence for controlled UAT or handover records.
13. Configure backup, restore, and disaster recovery procedures.
14. Document local boundaries, unsupported features, and residual risks.

## Roles And Permissions

ZTF-Orchestrator uses role-based access control. All protected screens require
a valid session token.

| Role | Intended user | Capabilities |
|---|---|---|
| Admin | Platform owner, lead operator, or trusted maintainer. | Full access to settings, users, approvals, jobs, configs, evidence, audit log, backup restore, and cleanup actions. |
| Operator | Infrastructure engineer running approved workflows. | Can prepare configs, run workflows, scripts, schedules, pipelines, NKP phases, drift checks, and evidence tasks where allowed. Cannot manage users or access admin-only audit screens. |
| Viewer | Auditor, stakeholder, or handover reviewer. | Can inspect dashboard, configs, jobs, schedules, evidence, drift, appliance state, upgrade assessments, and operational history. Mutation is blocked. |

Use the lowest role that allows the work. Admin accounts should be limited and
protected because they can change runtime settings, manage users, approve work,
and restore backups.

## Navigation Overview

The sidebar groups day-to-day work into operating areas.

| Area | Screens | Admin purpose |
|---|---|---|
| Overview | Dashboard, Setup & Install | Confirm readiness, bootstrap runtimes, detect blockers. |
| Configure | Global Config, Config Files, YAML Studio, Workflows 1.x, Workflows 2.x, ZTF 2.x IaC | Prepare and validate reusable configuration. |
| Execute | Scripts 1.x, Scripts 2.x, Jobs / Queue, Execution History, Pipelines, Schedules, Parallel Exec | Launch approved work and monitor execution. |
| Govern | Approvals, Drift Detection, Validation Evidence, Upgrade Advisor, NKP Framework | Manage review, compliance, evidence, and platform-specific readiness. |
| Admin | Settings, Users, Audit Log, Appliance Ops | Administer runtime, accounts, storage, backups, audit, and appliance operations. |

## Dashboard

The Dashboard is the operational cockpit. Admins should use it at the start of
each maintenance window and during incident response.

Key functions:

| Function | What it tells admins | Use case |
|---|---|---|
| Runtime readiness | Whether ZTF, ZTF 2.x, and NKP paths are detected. | Confirm the appliance or container is ready after install, update, or restore. |
| Deployment inventory | Count of configs, profiles, jobs, and operational records. | Understand whether a deployment is empty, active, or accumulating evidence. |
| Operations queue | Active, queued, running, failed, cancelled, or stale jobs. | Triage blocked workflows or verify no work is running before maintenance. |
| Governance state | Pending approvals and policy pressure. | Avoid running controlled tasks without authorization. |
| Validation evidence | Recent evidence capture posture. | Check whether UAT or change records have supporting artifacts. |
| Schedule posture | Enabled schedules, next-run times, and schedule failures. | Confirm repeatable drift checks or recurring jobs are healthy. |
| Storage and backup posture | Backend mode, backup metadata, and database state where available. | Confirm recovery readiness before risky changes. |

Operational use cases:

- Morning readiness check for an operations team.
- Pre-change review before running a workflow.
- Maintenance freeze confirmation before updates or restore work.
- Incident triage when a job, approval, or schedule is stuck.

## Setup And Install

Setup & Install helps admins bootstrap or repair the framework runtimes.

| Runtime lane | Purpose | Admin guidance |
|---|---|---|
| ZTF 1.x Legacy | Supports the existing workflow and script catalog through the legacy CLI model. | Use for Foundation Central, Prism Element, Prism Central, pod, workload, NDB, and script workflows that depend on ZTF 1.x. |
| ZTF 2.x IaC | Supports the separate plan/apply IaC lane. | Configure independently; do not treat it as a drop-in replacement for ZTF 1.x. |
| NKP Framework | Optional integration for NKP preparation and safe phases. | Register only after the NKP framework path and binary strategy are understood. |

Admin use cases:

- First installation of framework runtimes.
- Re-detecting a runtime after appliance update or host restore.
- Repairing a missing dependency in a lab environment.
- Confirming that Docker or appliance baked runtimes are visible.

In Docker and appliance deployments, bundled runtimes may be baked into the
image rather than mutable Git checkouts. Updating those runtimes normally means
rebuilding or updating the image, not running an in-place `git pull`.

## Global Config

Global Config builds the shared `global.yml` consumed by ZeroTouch Framework
workflows and scripts.

Feature areas:

| Area | Purpose | Use cases |
|---|---|---|
| Credentials | Define named credential references such as `pc_user`, `foundation_central`, `pe_user`, `ncm_user`, `cvm_credential`, and service-account references. | Standardize workflow references and avoid repeatedly editing credentials into every workflow YAML. |
| Vault settings | Record selected credential-source metadata. | Prepare for local, environment-backed, HashiCorp Vault, CyberArk, Azure Key Vault, AWS Secrets Manager, Delinea, BeyondTrust, or custom API integration patterns. |
| IPAM settings | Record address-source metadata. | Align static, CSV, reservation-file, NetBox, Nautobot, phpIPAM, Infoblox, BlueCat, EfficientIP, Microsoft DHCP/IPAM, or custom API patterns. |
| YAML preview | Show the generated `global.yml` before saving or downloading. | Review exact output before writing to the configured ZTF runtime. |

Important boundary:

Provider selections write configuration metadata. They do not automatically
prove live credential retrieval, mutating IP allocation, or vendor-provider
integration. Live provider behavior requires configured, permitted, and
validated adapters in the target environment.

Admin best practices:

- Use named credential references consistently across workflows.
- Avoid storing secrets in public documentation, screenshots, or exported
  artifacts.
- Review generated YAML before saving.
- Treat `global.yml` changes as change-controlled when used for shared
  operations.

## Config Files

Config Files is the shared library for YAML and JSON files used by workflows,
scripts, schedules, pipelines, drift checks, NKP operations, and evidence
records.

Key functions:

| Function | Admin value |
|---|---|
| Create or upload files | Seed reusable configs for common sites, clusters, or validation tasks. |
| Edit and save | Keep reviewed config content in one location. |
| Automatic backups | Preserve prior versions before overwrites. |
| Download | Export reviewed configs for change tickets or peer review. |
| Restore | Recover a previous config version after a bad edit. |
| Delete | Remove obsolete configs after confirmation. |

Use cases:

- Store a known-good cluster rebuild YAML.
- Preserve separate configs for lab, UAT, and production-like targets.
- Restore a config after an accidental edit.
- Download the exact config used in a change window.

Admin guidance:

- Keep filenames meaningful and environment-neutral where possible.
- Do not store local usernames, lab IPs, or secrets in public artifacts.
- Use Validation Evidence for formal handover rather than relying on a config
  file alone.

## YAML Studio

YAML Studio is the guided authoring workspace for creating and validating YAML
without executing infrastructure actions.

Modes:

| Mode | Purpose | Use case |
|---|---|---|
| Native Foundation Deploy | Draft controlled-UAT native Foundation deployment intent. | Prepare Dell iDRAC controlled-UAT plans and review guardrails. |
| Cluster Create | Generate ZTF 1.x Foundation Central cluster creation config. | Build a repeatable cluster creation or rebuild input. |
| Global Config | Generate starter shared configuration. | Bootstrap credentials, vault, and IPAM metadata. |
| ZTF 2.x IaC | Generate preview `input.yml` for the domains model. | Prepare desired-state plan input before approval-bound apply. |
| Blank YAML | Start from a clean editor with validation support. | Import or author custom reviewed YAML. |

Key actions:

| Action | Result |
|---|---|
| Generate YAML | Creates YAML from wizard fields. |
| Revalidate | Checks parser and shape expectations through the backend. |
| Save to ZTF | Writes the YAML into the config library. |
| Download | Exports YAML and validation metadata. |

YAML Studio is intentionally non-mutating. It does not run ZTF, NKP, Prism,
Foundation Central, or provider operations. Execution happens only through the
governed execution pages and durable job queue.

## Workflows 1.x

Workflows 1.x covers the legacy ZeroTouch Framework workflow catalog. These
workflows execute through the guarded `python main.py --workflow` model after
validation, optional dry run, and any required approvals.

Workflow families:

| Workflow | Purpose | Primary use cases |
|---|---|---|
| Cluster Create | Creates clusters using Foundation Central with node imaging and cluster formation. | Greenfield cluster deployment, rebuild from known-good cluster input, lab/UAT cluster creation. |
| Cluster Create (Standalone FCA) | Submits cluster creation through standalone Foundation Central Appliance Lifecycle APIs. | FCA-based cluster creation where Lifecycle API handoff is validated and acknowledged. |
| Imaging Only | Images nodes without forming a cluster. | Bare-metal preparation, node re-imaging, staged rebuild preparation. |
| Imaging Only (Standalone FCA) | Submits imaging through standalone FCA Lifecycle APIs. | FCA-controlled imaging where cluster formation happens later. |
| Pod Imaging | Combines imaging and cluster creation for pod deployment. | Pod deployment and multi-cluster site patterns. |
| Pod Imaging (Standalone FCA) | Runs pod imaging through standalone FCA Lifecycle APIs. | FCA-based pod deployment handoff. |
| Site Deploy | Deploys a full site with imaging, cluster creation, and basic config. | Multi-site or edge-site rollout. |
| Site Deploy (Standalone FCA) | Runs site deployment through standalone FCA Lifecycle APIs. | FCA-based site deployment under explicit acknowledgement. |
| Native Foundation Deploy | Plans native Foundation deployment with controlled-UAT guardrails. | Dell iDRAC controlled-UAT AHV HCI deployment planning, review packet creation, evidence capture. |
| Configure Cluster | Applies Day-1 and Day-2 cluster settings. | AD, storage, VLANs, NTP/DNS, and HA standardization. |
| Post-Foundation Baseline | Applies or records safe post-foundation Prism Element baseline actions. | EULA/Pulse, health checks, PC registration, HA, DSIP, DNS, NTP, and storage baseline after creation. |
| PE Monitoring Baseline | Plans monitoring, alerting, and evidence checks. | NCC evidence, SMTP, alert contacts, SNMPv3, and syslog planning. |
| AHV Security Hardening | Plans Prism Element, CVM, and AHV hardening controls. | Security hardening checklist, evidence capture, and manual/blocked control tracking. |
| PE Network Baseline | Plans virtual switch and VM network settings. | Standard network setup after rebuild or deployment. |
| PE Certificate Baseline | Plans CSR and certificate replacement steps. | Certificate refresh workflows and evidence-only certificate validation. |
| Hardware OOB Baseline | Plans vendor out-of-band hardware baseline tasks. | BMC inventory evidence and future credential/BIOS/Secure Boot mapping review. |
| Deploy Prism Central | Deploys Prism Central VM instances. | Initial management-plane deployment or rebuild. |
| Configure Prism Central | Configures Prism Central services. | AD, SAML, security policies, NKE, Objects, DR, and Flow policy setup. |
| Pod Config | Configures pod and edge site clusters at scale. | Nutanix Validated Design style pod operations. |
| Deploy Management PC | Deploys Prism Central and NCM management instances. | Management plane deployment for multi-site operations. |
| Configure Management PC | Initializes Prism Central and NCM. | Post-deployment registration, policies, and cluster connections. |
| Calm VM Workloads | Deploys application workloads through Calm DSL blueprints. | Controlled workload deployment after infrastructure readiness. |
| Edge AI Workload | Deploys Edge-AI application workloads. | Specialized edge AI or ML workload rollout. |
| NDB Deploy | Deploys and configures Nutanix Database Service. | Database platform provisioning and cluster registration. |
| LCM Update | Runs lifecycle management update workflows. | Governed update workflows with reviewed YAML and approvals. |

Execution controls:

- Workflow IDs are allowlisted.
- YAML is parsed before execution.
- Destructive or special handoff workflows can require explicit
  acknowledgement text.
- Approval-bound workflows require a matching approved request.
- Jobs run through durable queue records rather than browser-bound sessions.
- Logs, return codes, task IDs, and metadata are retained.

## Workflows 2.x And ZTF 2.x IaC

ZTF 2.x is a separate plan/apply lane. It is not a replacement launcher for
the legacy ZTF 1.x workflow catalog.

Available starter workflows:

| Template | Purpose | Use case |
|---|---|---|
| Prism Category | Multi-category Prism Central intent. | Standard tags for governance, chargeback, automation, or policy targeting. |
| Project | Prism Central project intent. | Tenant or application project setup. |
| Subnet Intent | Multi-subnet or VLAN resource intent. | Network desired-state planning. |
| Image Registration | Disk, ISO, or cloud-init image registration. | Preparing images for VM provisioning. |
| VM Deployment | VM sizing, image, subnet, category, and power-state intent. | Governed VM deployment through desired-state planning. |
| Security Groups | Address and service group intent. | Foundation for Flow policy and reusable security objects. |
| Protection Policy | Protection policy with schedule and RPO. | Data protection planning before approval-bound apply. |
| Recovery Plan | Disaster recovery plan linked to projects, subnets, VMs, and recovery locations. | DR plan definition and review. |

Admin operating model:

1. Configure the ZTF 2.x path, command, and project directory in Settings.
2. Generate or import `input.yml` and `global.yml`.
3. Run Plan to produce evidence.
4. Request approval for apply or destroy.
5. Apply only when the approval is bound to the plan ID, input hash, global
   hash, and state path.

Use case distinction:

- Use Workflows 1.x for current legacy ZTF operational workflows.
- Use ZTF 2.x IaC for governed desired-state planning and approved apply.
- Use ZTF 2.x Recovery Plan for DR plan intent, not for malware cleanup,
  backup recovery, or forensic response.

## Scripts 1.x

Scripts 1.x exposes allowlisted ZTF 1.x script actions. Admins use scripts for
narrow operational changes that do not require a full workflow.

Script categories and common use cases:

| Category | Examples | Use cases |
|---|---|---|
| Authentication | Add AD Server, create role mapping, configure SAML IDP, add users/groups/roles. | Standardize identity integration after cluster or PC deployment. |
| Networking | Create/delete PE or PC subnets, manage VPCs, add DNS and NTP servers. | Rebuild network baselines, add tenant networks, correct post-deploy network settings. |
| Storage | Create/delete containers, object stores, and buckets. | Restore baseline storage objects after rebuild or deploy new service capacity. |
| Compute | Create/delete VMs and power-transition VMs. | Controlled VM provisioning or cleanup through reviewed config. |
| Images | Upload/delete disk, ISO, and OVA images. | Prepare image catalog for workload restore or deployment. |
| Security | Create/delete Flow security policy objects, address groups, service groups, and categories. | Reapply segmentation prerequisites after rebuild. |
| Kubernetes | Create NKE cluster, enable NKE. | Platform bootstrap where legacy script support is validated. |
| Database | Configure NDB and register clusters. | Prepare database services after infrastructure readiness. |
| Prism Central | Deploy PC, register PE, enable microsegmentation, Objects, DR, Foundation Central, Marketplace, and related objects. | Rebuild management plane services or standardize PC configuration. |
| Prism Element | Accept EULA, update Pulse, configure HA, rebuild capacity, DSIP. | Post-foundation baseline and recovery readiness. |
| System | Update CVM Foundation. | Maintain Foundation components where supported. |

Admin guidance:

- Prefer workflows when multiple dependent scripts need to run together.
- Prefer scripts for narrow, well-understood changes.
- Use dry-run or validation where available.
- Use Jobs / Queue to monitor output and target task IDs.
- Capture Validation Evidence after UAT-significant script runs.

## Scripts 2.x

Scripts 2.x provides narrow ZTF 2.x plan-oriented actions that map selected
legacy patterns to declarative IaC templates.

| Script | Purpose |
|---|---|
| Create Category (PC) | Generates Prism Central category intent. |
| Create Project (PC) | Generates Prism Central project intent. |
| Create Subnets (PC) | Generates subnet or VLAN intent. |
| Upload Image (PC) | Generates VM image registration intent. |
| Create VMs (PC) | Generates VM desired-state intent. |
| Create Security Groups (PC) | Generates address and service group intent. |
| Create Protection Policy (PC) | Generates protection policy intent. |
| Create Recovery Plan (PC) | Generates recovery plan intent. |

Apply and destroy remain governed by the ZTF 2.x approval-bound operating model.

## Jobs And Queue

Jobs / Queue is the execution control center.

Key functions:

| Function | Admin value |
|---|---|
| Queue list | Shows queued, running, completed, failed, cancelled, and interrupted work. |
| Expanded logs | Provides retained stdout/stderr style context for troubleshooting. |
| Progress and task IDs | Helps correlate Orchestrator jobs with target Nutanix tasks. |
| Cancellation | Lets admins interrupt supported queued or running work. |
| History metadata | Preserves user, config, approval, runtime, and trace metadata. |

Use cases:

- Monitor a cluster deployment during a change window.
- Prove whether a workflow actually started.
- Diagnose failed framework execution.
- Capture task IDs for Prism, Foundation Central, or change records.
- Confirm the queue is empty before maintenance or restore.

## Execution History

Execution History gives a durable view of completed workflow and script runs.

Use it to:

- Review who launched a workflow and when.
- Confirm status, return code, and selected config.
- Find prior output when preparing a handover.
- Link completed work to Validation Evidence.
- Compare repeated executions of the same workflow.

Administrators should retain history long enough to satisfy internal change
and audit requirements.

## Approvals

Approvals provide the governance layer for controlled work.

Common approval use cases:

| Approval target | Why it matters |
|---|---|
| Destructive or mutating workflows | Prevent accidental imaging, deletion, or configuration drift. |
| ZTF 2.x apply or destroy | Bind approval to exact plan evidence and hashes. |
| NKP controlled phases | Require review before deployment-affecting phases. |
| Native Foundation controlled-UAT records | Tie read-only review packets and evidence to future execution gates. |
| Disaster recovery rebuild workflow | Ensure containment, authorization, scope, and restore prerequisites are approved before rebuilding infrastructure. |

Admin guidance:

- Require approvals for high-impact changes.
- Bind approvals to config hashes, plan IDs, job IDs, evidence IDs, or change
  tickets where available.
- Do not approve work based only on a verbal summary when the exact YAML or
  plan evidence is available.
- Retain approval records for audit and UAT traceability.

## Pipelines

Pipelines group repeatable operational steps into a named sequence.

Use cases:

- Run a baseline sequence after cluster creation.
- Separate validation, configuration, and evidence steps.
- Standardize edge-site deployment activities.
- Prepare a repeatable DR rebuild sequence with human approval gates between
  phases.

Admin guidance:

- Keep pipeline steps small enough to troubleshoot.
- Avoid hiding risky actions inside broad pipeline names.
- Capture evidence after significant phases.
- Use approvals for destructive, recovery, or customer-impacting steps.

## Schedules

Schedules allow repeatable jobs to run at configured times.

Use cases:

- Periodic drift checks.
- Repeated validation or evidence tasks.
- Routine health or readiness checks.
- Scheduled non-destructive reports.

Admin guidance:

- Avoid scheduling destructive or environment-mutating tasks without strong
  governance.
- Review schedule failures on the Dashboard and Schedules page.
- Disable schedules before maintenance, restore, or incident response if they
  could interfere with recovery.
- Confirm timezone selection and next-run time after creation.

## Parallel Execution

Parallel Execution coordinates similar work across multiple targets.

Use cases:

- Multi-site validation.
- Edge-site baseline comparison.
- Repeated config checks across clusters.
- Controlled rollout waves where parallelism is intentionally limited.

Admin guidance:

- Start with low parallelism until target behavior is validated.
- Consider blast radius, maintenance windows, and rate limits.
- Use job history and evidence to record per-target outcomes.
- Avoid using parallel execution as a shortcut around approvals.

## Drift Detection

Drift Detection compares expected configuration intent with observed or stored
state signals.

Use cases:

- Detect unexpected config edits.
- Review whether a cluster remains aligned with baseline after handover.
- Support compliance or operational review.
- Feed a corrective workflow or change request.

Admin guidance:

- Treat drift as an investigation signal, not automatically as a bug.
- Confirm source data and time window before taking corrective action.
- Capture evidence before and after remediation.
- Use schedules for recurring non-destructive drift checks.

## Validation Evidence

Validation Evidence creates timestamped evidence records for UAT, change
records, handover, and internal audit.

Evidence sources can include:

- Saved NKP profiles.
- Completed workflow or script executions.
- Saved YAML or JSON configs.
- ZTF workflow UAT summaries.
- Native Foundation phase captures and review packet metadata.

Use cases:

- Attach evidence to a change record.
- Build customer or internal UAT handover packs.
- Preserve generated YAML, config hashes, parse status, linked approvals, job
  references, task references, notes, and redacted output.
- Record readiness before a DR rebuild or after a cluster baseline restoration.

Admin guidance:

- Capture evidence close to the time of validation.
- Redact secrets and private environment details.
- Prefer evidence IDs over screenshots alone.
- Export ZIP bundles when records must survive outside the Orchestrator.

## NKP Framework

The NKP Framework page integrates optional Nutanix Kubernetes Platform
preparation workflows.

Feature areas:

| Feature | Purpose | Use case |
|---|---|---|
| Framework status | Detect NKP framework path and readiness. | Confirm integration after install or appliance update. |
| Safe phases | Launch allowlisted NKP phases such as validate, prepare, generate, registry, deploy, verify, kubeconfig, secrets, backup, runs, and CI. | Governed NKP preparation and validation. |
| Deployment Profile Builder | Build NKP deployment profiles with Prism Central, cluster, network, VLAN, DNS, NTP, and node inventory data. | Standardize management, workload, or air-gapped NKP deployment inputs. |
| Template packs | Seed Management Cluster, Workload Cluster, or Air-Gapped / Local Registry profile drafts. | Reduce setup errors while keeping profiles editable. |
| Example discovery | Discover installed examples from the configured NKP framework path. | Align generated YAML with the installed framework. |
| Binary Manager | Register or upload NKP binaries and bundles. | Track versions, paths, checksums, and defaults. |
| Readiness validation | Score profiles as ready, needs attention, or blocked. | Prevent malformed profile launches. |

Governance boundary:

Controlled NKP phases require approval. Destructive, broad, or unsupported NKP
actions remain blocked server-side.

## Upgrade Advisor

Upgrade Advisor helps administrators assess upgrade risk from maintained rules.

Use cases:

- Review known upgrade constraints before changing AOS, Prism Central, AHV, or
  related components.
- Attach upgrade risk notes to a change record.
- Identify prerequisites before scheduling LCM or platform updates.

Admin guidance:

- Treat advisory output as a planning aid, not vendor certification.
- Cross-check target versions against official vendor documentation.
- Preserve the assessment with Validation Evidence or change records when used
  for governed maintenance.

## Appliance Operations

Appliance Ops supports AHV or VM-based appliance administration.

Feature areas:

| Feature | Purpose |
|---|---|
| Appliance readiness | Review first-boot, runtime, storage, update, and framework state. |
| Update package handling | Stage connected or air-gapped update packages. |
| Installed Build metadata | Identify exact version, source ref, commit, image, and update package. |
| Backup posture | Review required pre-update backup state and restore prerequisites. |
| NKP and ZTF compatibility signals | Confirm baked or configured framework versions after update. |

Use cases:

- Validate a fresh appliance deployment.
- Confirm exact running build before support or UAT.
- Apply an offline update package in a disconnected environment.
- Review pre-update backup status before maintenance.
- Recover from a failed appliance update using documented runbooks.

Admin guidance:

- Keep appliance update packages, Docker image tars, QCOW2 images, GitHub
  Release assets, and internal artifact storage clearly separate.
- Always record Installed Build metadata after an update.
- Do not treat an offline update package as a full appliance image.

## Settings

Settings is the main administrative control panel.

Common sections:

| Section | Purpose | Admin guidance |
|---|---|---|
| Runtime | Configure ZTF path, ZTF 2.x path and command, Python executable, config directory, and related runtime settings. | Verify after install, update, restore, or path changes. |
| Governance | Configure approval requirements and controlled execution posture. | Require approval for high-impact work. |
| Storage | Review active backend, database location, retention, and PostgreSQL backup operations. | Use PostgreSQL for durable team deployments. |
| Notifications | Configure webhook notification target for workflow or script completion. | Use allowed host controls and avoid insecure HTTP outside labs. |
| About | Show version and Installed Build metadata. | Use for support, UAT records, and update verification. |

Admin use cases:

- Point Orchestrator at reviewed framework checkouts.
- Configure backup and restore operations.
- Set notification webhook behavior.
- Confirm the exact patch or appliance build.
- Review storage mode before declaring a deployment production-assessable.

## Users

The Users page is admin-only.

Capabilities:

- Create user accounts.
- Assign admin, operator, or viewer roles.
- Reset passwords.
- Review account access.

Admin guidance:

- Use named accounts rather than shared accounts.
- Keep admin role assignments minimal.
- Remove or downgrade accounts after short-term projects.
- Rotate passwords after first installation, personnel changes, or suspected
  exposure.

## Audit Log

The Audit Log is admin-only and shows structured application events.

Use cases:

- Review authentication events.
- Investigate failed or unauthorized actions.
- Correlate configuration edits with job submissions.
- Support UAT and change-control review.
- Investigate incident timelines.

Admin guidance:

- Preserve audit logs before restore or cleanup.
- Do not rely on the Audit Log as the only system of record for external
  change approval.
- Export or retain relevant evidence outside the app for long-term audit needs.

## Security Administration

ZTF-Orchestrator is designed for trusted internal networks. It should not be
directly exposed to the internet.

Core controls:

- Session-based authentication with expiring bearer tokens.
- bcrypt password hashing.
- Role-based protected routes.
- API rate limits on login, execution, and install-sensitive paths.
- Workflow and script allowlists.
- YAML safe parsing.
- Path traversal protections around config file operations.
- Subprocess execution through argument lists rather than shell strings.
- Security headers including CSP-related controls.
- Docker Compose host binding to localhost by default.

Admin hardening checklist:

1. Put nginx or an equivalent reverse proxy with TLS in front of team
   deployments.
2. Restrict network access to trusted administration networks.
3. Rotate first-run credentials immediately.
4. Use PostgreSQL for durable shared state.
5. Back up database and VM/container state before updates.
6. Keep secrets out of exported docs, screenshots, public issues, release
   notes, and generated artifacts.
7. Review webhook host restrictions before enabling notifications.
8. Run controlled UAT before representing a workflow as production validated.

## Backup, Restore, And Disaster Recovery

ZTF-Orchestrator stores operational state that must be recoverable:

- Users and sessions.
- Settings and runtime configuration.
- Config files and automatic backups.
- Execution history and job logs.
- Approvals and schedules.
- Validation evidence.
- Audit events.
- PostgreSQL backups.

Minimum DR objectives:

| Objective | Admin decision |
|---|---|
| RPO | How much Orchestrator state loss is acceptable. |
| RTO | How quickly the admin console must be restored. |
| Backup location | Where database, VM/container, and exported evidence backups are stored. |
| Restore environment | Where the service will be restored if the primary host is unavailable. |
| Secret rotation | Which credentials must rotate after restore or incident. |
| Evidence retention | Which evidence exports must survive outside the app. |

Use cases:

- Restore the Orchestrator after appliance failure.
- Roll back from a failed update.
- Recover PostgreSQL-backed state after database corruption.
- Rebuild a disconnected deployment from update packages and retained backups.
- Preserve evidence after an infrastructure incident.

Related runbooks:

- `docs/runbooks/RB-002-backup-restore.md`
- `docs/runbooks/RB-003-upgrade-rollback.md`
- `docs/runbooks/RB-010-database-recovery.md`
- `docs/governance/DISASTER-RECOVERY.md`

## Disaster Recovery Cluster Rebuild Use Case

ZTF-Orchestrator can be part of a broader disaster recovery process for
rebuilding affected Nutanix infrastructure from known-good baselines.

Appropriate positioning:

> ZTF-Orchestrator automates the infrastructure rebuild and validation phase of
> a broader disaster recovery process. It does not perform malware remediation,
> forensic investigation, backup recovery, or ransomware detection.

Example scenario:

1. A cluster is affected by ransomware, malware, severe misconfiguration, or a
   destructive operational event.
2. Security and infrastructure teams isolate the environment, preserve evidence,
   and decide that the cluster should be rebuilt rather than trusted in place.
3. The recovery lead approves a predefined rebuild process and selects a
   reviewed ZTF-Orchestrator workflow or pipeline.
4. ZTF-Orchestrator uses approved configuration to coordinate imaging,
   reinstallation, baseline configuration, and validation where supported.
5. The workflow reapplies known-good settings such as DNS, NTP, VLANs, storage
   containers, Prism registration, monitoring, security hardening evidence, and
   post-foundation checks.
6. Validation gates confirm cluster health, API reachability, time sync,
   expected services, and configuration posture.
7. Backup, DR, or application teams restore workloads only after the rebuilt
   infrastructure is accepted.

Recommended workflow pattern:

| Phase | Human process | ZTF-Orchestrator capability |
|---|---|---|
| Declare and contain | Incident commander freezes changes and confirms containment. | Disable schedules and confirm no jobs are running. |
| Authorize rebuild | Change owner approves rebuild scope and target baseline. | Approval Gate records authorization and binds reviewed config. |
| Reinstall or reimage | Infrastructure owner confirms hardware, images, and network data. | Cluster Create, Imaging Only, Site Deploy, FCA handoff, or Native Foundation controlled-UAT planning where applicable. |
| Apply baseline | Platform owner selects known-good config. | Configure Cluster, Post-Foundation Baseline, PE Network Baseline, Monitoring Baseline, Certificate Baseline, and Security Hardening evidence. |
| Validate | Operators and reviewers confirm readiness. | Dry run, Jobs / Queue, Execution History, Drift Detection, Validation Evidence. |
| Handover | Backup or application team starts workload restore. | Evidence bundle exported for change record and recovery handover. |

Controls to require:

- Explicit incident and rebuild authorization.
- Known-good configuration source.
- Backup and workload restore owner identified.
- Secrets rotated where compromise is possible.
- Evidence captured before and after rebuild.
- Target-side tasks verified in Prism, Foundation Central, FCA, or NKP tools as
  applicable.

## Native Foundation Controlled-UAT Boundary

Native Foundation Deploy is an extensive planning and evidence framework for
Orchestrator-owned Foundation-style deployment workflows.

Current administrative boundary:

- Most Native Foundation phases are read-only reviews.
- They produce plans, manifests, matrices, evidence packets, hashes, approval
  bindings, and readiness records.
- They do not automatically contact hardware, call Foundation, mutate Prism, or
  image nodes unless a controlled-UAT adapter path is explicitly enabled and
  validated.
- Dell iDRAC Redfish deployment support is controlled-UAT only unless local
  evidence and signoff establish a broader support claim.

Admin use cases:

- Build a controlled-UAT deployment packet.
- Confirm provider/topology support status.
- Review image, network, secret, approval, evidence, runtime, and adapter
  readiness.
- Generate a redacted packet for review.
- Capture Native Foundation phase evidence.

Do not describe planning artifacts, mocked tests, or dry-run packets as proof
of live infrastructure support.

## Operational Runbooks

Administrators should keep runbooks close to the work. The repository includes
standard runbooks for common operational events.

| Runbook | Use case |
|---|---|
| RB-001 Start, Stop, Restart | Routine service administration. |
| RB-002 Backup and Restore | Normal backup and restore procedures. |
| RB-003 Upgrade Rollback | Failed update or rollback planning. |
| RB-004 ZTF Workflow Execution | Standard governed workflow execution. |
| RB-005 Failed Job Recovery | Recover or triage failed jobs. |
| RB-006 Emergency Stop | Freeze execution during incidents. |
| RB-007 Air-Gapped Update | Update disconnected deployments. |
| RB-008 NKP Safe Phase Execution | Governed NKP phase operations. |
| RB-009 User RBAC Management | User and role administration. |
| RB-010 Database Recovery | PostgreSQL restore and database recovery. |
| RB-011 Security Incident | Security incident response for the Orchestrator. |
| RB-012 Decommission | Retiring a deployment safely. |
| RB-013 Test FCA Port From CVM | Foundation Central connectivity validation. |

Use runbooks for execution detail. Use this Admin Guide to understand feature
intent and operating boundaries.

## Common Administrative Scenarios

### Onboard A New Operator

1. Create a named operator account.
2. Confirm the user can log in.
3. Review role limitations.
4. Provide access to the relevant runbooks.
5. Have the operator run a non-mutating validation or dry run first.

### Prepare A New Cluster Deployment

1. Confirm runtime readiness on Dashboard.
2. Create or update Global Config.
3. Generate workflow YAML in YAML Studio.
4. Save the config in Config Files.
5. Run validation or dry run.
6. Request approval if required.
7. Launch through Workflows.
8. Monitor Jobs / Queue.
9. Capture Validation Evidence.

### Rebuild A Cluster After An Incident

1. Confirm incident containment outside ZTF-Orchestrator.
2. Freeze schedules and unrelated jobs.
3. Select a known-good rebuild config.
4. Obtain approval for rebuild scope.
5. Run imaging, cluster creation, or site deployment workflow as appropriate.
6. Apply post-foundation, network, monitoring, certificate, and security
   baselines.
7. Validate cluster readiness and capture evidence.
8. Hand over to backup or application recovery teams.

### Investigate A Failed Workflow

1. Open Jobs / Queue and inspect the failed job.
2. Check return code, output, detected task IDs, config file, and approval
   binding.
3. Check target system task status.
4. Review Audit Log for related errors.
5. Preserve logs and config.
6. Use RB-005 before retrying.

### Prepare For An Appliance Update

1. Confirm no jobs are running.
2. Create or verify PostgreSQL and VM/container backups.
3. Record Installed Build metadata.
4. Stage update package and checksums.
5. Apply update through the documented appliance workflow.
6. Validate `/health`, login, Dashboard readiness, Jobs, Approvals, Config
   Files, Audit Log, Settings, and Validation Evidence.
7. Record new Installed Build metadata.

## Evidence And Claim Boundaries

Use precise language in admin records, customer communications, and public
artifacts.

| Claim | Safe wording |
|---|---|
| Demo UI | "Static demo with simulated data." |
| Dry run | "Validation or planning output; not proof of target mutation." |
| Controlled UAT | "Validated for the named environment, hardware, version, and scope captured in evidence." |
| Native Foundation plan | "Read-only planning and evidence packet unless a controlled-UAT adapter path is explicitly enabled and validated." |
| Disaster recovery | "Infrastructure rebuild and validation orchestration as part of a broader DR process." |
| Ransomware scenario | "Post-containment rebuild from known-good baseline; not malware remediation or forensic tooling." |
| Vendor support | "Independent community operations layer; not vendor-affiliated or vendor-supported." |

## Admin Definition Of Done

An administrative change is complete when:

- The requested setting, user, workflow, schedule, backup, or evidence action is
  implemented.
- Relevant validation or dry-run checks are complete.
- Jobs have terminal status, or skipped execution is documented.
- Smoke checks prove the main changed path works.
- Security-sensitive changes are reviewed.
- Evidence, approvals, audit records, and residual risks are documented.

## Related Documentation

- `README.md`
- `docs/user-guide.md`
- `docs/installation-guide.md`
- `docs/appliance-update-manager.md`
- `docs/governance/README.md`
- `docs/governance/DISASTER-RECOVERY.md`
- `docs/production-readiness-boundary.md`
- `docs/security/SECURITY_ASSESSMENT.md`
- `docs/runbooks/README.md`
- `docs/testing/README.md`
- `docs/uat/README.md`
