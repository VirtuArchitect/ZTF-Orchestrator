# ZTF-Orchestrator User Guide

This guide explains the ZTF-Orchestrator user interface, sidebar menu items,
major features, and the operational purpose of each screen.

ZTF-Orchestrator is an internal operations console for preparing, validating,
executing, and auditing Nutanix ZeroTouch Framework 1.x workflows/scripts,
separate governed ZTF 2.x IaC plan/apply jobs, and guarded NKP preparation
phases. It is the control plane and evidence layer. ZeroTouch Framework, NKP
ZeroTouch Framework, Prism Central, Prism Element, and Foundation Central remain
the systems that perform the underlying infrastructure work.

The static demo uses simulated data. Treat it as a product tour, not as proof
that a deployment has validated live infrastructure.

## Roles And Access

The visible menu depends on the signed-in user's role.

| Role | Intended user | Access summary |
|---|---|---|
| Admin | Platform owner or trusted operator | Full access, including user management, audit log, settings, backup restore, approvals, and destructive record cleanup. |
| Operator | Infrastructure operator | Can configure and execute governed workflows, scripts, schedules, pipelines, NKP phases, drift checks, and evidence runs. Cannot manage users or view admin-only audit screens. |
| Viewer | Reviewer, auditor, or stakeholder | Can view operational state, configs, jobs, schedules, evidence, drift results, appliance state, NKP state, and upgrade assessments. Viewer actions are read-only where execution or mutation would occur. |

All protected pages require login. If a user opens a page their role cannot
access, the app shows an access-denied page instead of the requested feature.

## Navigation Shell

The left sidebar is the primary menu. It is grouped into Overview, Configure,
Execute, Govern, and Admin.

The logo at the top returns to the Dashboard. The status indicator below the
logo shows whether the ZeroTouch Framework path is currently detected. The
sidebar can be expanded with labels or collapsed to compact icon navigation.
When collapsed, hover over an icon to see the menu label.

## Common Operating Flow

Most production-style work follows this path:

1. Configure runtime paths and connection defaults in Settings.
2. Define credentials, vault behavior, and IPAM in Global Config.
3. Generate, upload, or edit YAML in YAML Studio, Config Files, Workflows, NKP Framework, or Scripts.
4. Validate the YAML and run a dry run where available.
5. Request approval for governed workflows or NKP phases.
6. Submit the work as a durable job through Workflows, Scripts, Pipelines, Schedules, Parallel Exec, or NKP Framework.
7. Monitor Jobs / Queue and Execution History.
8. Capture Validation Evidence, review Drift Detection, and consult Audit Log for governed records.

## Overview Menu

### Dashboard

Use Dashboard as the daily operations cockpit.

The Dashboard summarizes framework readiness, deployment inventory, queue
pressure, governance state, validation evidence posture, schedules, storage,
database backup state, and recent activity. It also provides quick links into
common actions such as creating configuration, opening workflow launchers,
checking jobs, and exporting evidence.

Key functions:

| Area | Function |
|---|---|
| Refresh | Manually reloads dashboard data. The screen also refreshes periodically. |
| Readiness Layers | Shows ZTF and NKP readiness signals so operators can see whether the required framework pieces are configured. |
| Deployment Inventory | Summarizes saved profiles, configs, executions, and discovered operational records. |
| Operations Queue | Highlights active, queued, running, failed, interrupted, or long-running jobs that need attention. |
| Governance | Shows pending approvals and policy pressure. |
| Validation Evidence | Indicates whether evidence packages have been captured for recent work. |
| Schedules | Shows enabled schedules, next-run information, and recent schedule failures. |
| Storage | Shows backend mode and backup posture, including PostgreSQL backup signals when applicable. |
| Quick Actions | Routes operators to common starting points without hunting through the full sidebar. |

Use Dashboard first when you need a fast answer to "is the orchestrator ready,
busy, blocked, or waiting on governance?"

### Setup & Install

Use Setup & Install to install or detect ZeroTouch Framework runtimes from the
UI. Select **ZTF 1.x Legacy** for the existing workflow/script catalog, or
**ZTF 2.x IaC** for the separate plan/apply runtime.

Key functions:

| Function | Purpose |
|---|---|
| Runtime selector | Chooses the ZTF 1.x or ZTF 2.x setup lane. |
| System check | Verifies that required local tools and selected runtime paths are available. |
| Install framework | Clones or installs the selected ZeroTouch Framework runtime from the configured source. |
| Installation output | Shows install progress and command output for troubleshooting. |
| Settings handoff | Directs operators to Settings when paths or framework location need adjustment. |

ZTF 2.x installs into its own checkout and CLI runtime. After installation, an
admin still controls whether the runtime is available for jobs from **Settings >
Runtime**. This screen is for bootstrap and remediation. Once the framework is
detected, most day-to-day work happens in Configure, Execute, and Govern pages.

### Workflows 1.x

Use **Workflows 1.x** for the existing ZTF 1.x workflow/script catalog. These
workflows generate legacy config YAML, support dry-run preflight where defined,
and execute through the guarded `python main.py --workflow` path.

### Workflows 2.x

Use **Workflows 2.x** for ZTF 2.x IaC templates. These workflows generate
`input.yml`, an editable `global.yml`, and a state file name. Selecting **Run
Plan** submits a governed `ztf2:plan` job and stores plan evidence on the job
record. Apply and destroy remain separate approval-bound actions from the ZTF
2.x IaC page.

Available starter templates:

| Workflow | Purpose |
|---|---|
| ZTF 2.x Prism Category | Multi-category Prism Central intent. |
| ZTF 2.x Project | Project intent with cluster, subnet, and account references. |
| ZTF 2.x Subnet Intent | Multi-subnet/VLAN intent. |
| ZTF 2.x Image Registration | Disk, ISO, or cloud-init image registration intent. |
| ZTF 2.x VM Deployment | VM intent with sizing, image, subnet, categories, and power state. |
| ZTF 2.x Security Groups | Address and service group intent. |
| ZTF 2.x Protection Policy | Protection policy intent with schedule and RPO. |
| ZTF 2.x Recovery Plan | Recovery plan intent with VM, subnet, and recovery location references. |

The templates are operational starters. Validate generated plans against the
installed ZTF 2.x resource schema before using approval-bound apply.

## Configure Menu

### Global Config

Use Global Config to build and save `global.yml`, the shared ZeroTouch Framework
configuration file.

Tabs and functions:

| Tab | Function |
|---|---|
| Credentials | Defines named credential references such as `pc_user`, `foundation_central`, `pe_user`, `ncm_user`, and `cvm_credential`. Workflow YAML uses these references instead of embedding usernames everywhere. |
| Vault Settings | Selects local credentials or CyberArk integration and captures vault connection fields. |
| IPAM | Selects static IP assignment or Infoblox-backed allocation and captures Infoblox host, DNS view, and network view values. |
| YAML Preview | Shows the generated `global.yml` content before saving or downloading. |

Actions:

| Action | Function |
|---|---|
| Show/Hide Passwords | Temporarily reveals or masks credential passwords in the browser. |
| Add Credential | Adds another named credential reference. |
| Delete credential row | Removes an unused credential reference from the generated config. |
| Download | Downloads the generated `global.yml`. |
| Save to ZTF | Saves the generated global configuration through the backend. |

Use this page before running workflows that reference credentials, vaults, or
IPAM settings.

### Config Files

Use Config Files to manage saved YAML and JSON configuration files used by
workflows, scripts, schedules, pipelines, NKP phases, drift checks, and evidence
records.

Key functions:

| Function | Purpose |
|---|---|
| File list | Shows available saved config files. |
| New file | Creates an empty YAML or JSON config file. |
| Upload | Imports an existing config from the workstation. |
| Editor | Lets operators edit selected config content directly. |
| Save | Writes the current content. Existing files are backed up before overwrite. |
| Download | Downloads the selected config. |
| Delete | Removes a selected config after confirmation. |
| History | Shows recent automatic backups, including timestamp and size. |
| Restore | Restores a prior version. The current file is backed up first. |
| Open YAML Studio | Routes to YAML Studio for guided generation. |

Use Config Files as the shared config library for repeatable, reviewable work.

### YAML Studio

Use YAML Studio to generate and validate ZTF-compatible Nutanix YAML without
executing anything.

Modes:

| Mode | Function |
|---|---|
| Cluster Baseline | Generates conservative Prism Element baseline YAML for DNS, NTP, storage containers, subnets, HA reservation, Pulse, and EULA-style settings. |
| Workflow YAML | Generates workflow or script YAML from guarded schema-driven forms. |
| Global Config | Produces starter global configuration content. |
| Upgrade Rules | Produces Upgrade Advisor source-pack or rule-pack content. |

Actions:

| Action | Function |
|---|---|
| Generate | Builds YAML from the selected mode and form fields. |
| Validate | Sends YAML to the backend for parser and shape validation. |
| Save Config | Saves generated YAML into Config Files using existing backup behavior. |
| Export | Downloads a bundle containing YAML and validation metadata. |

YAML Studio is intentionally non-mutating. It does not run ZTF, NKP, Prism, or
Foundation Central operations. Execution remains behind Workflows, Scripts, NKP
Framework, approvals, confirmations, and durable jobs.

### Workflow Catalog

Use Workflows 1.x and Workflows 2.x to browse and launch prebuilt ZTF workflow
families. Workflows 1.x runs guarded legacy workflow jobs. Workflows 2.x
generates governed ZTF 2.x IaC plan jobs that can later be used as the source
for approval-bound apply or destroy requests.

The catalogs are grouped by category and include Infrastructure, Configuration,
Prism Central, Pod Operations, Workloads, Services, and System workflows where
templates exist. Selecting a workflow opens its detail page.

Workflow detail functions:

| Function | Purpose |
|---|---|
| Configure tab | Presents guided fields for the selected workflow. Specialized workflows use specialized forms. Generic workflows use a shared config form. |
| YAML Preview tab | Shows the active generated or imported YAML. |
| Import Config | Imports an existing YAML or JSON file for the selected workflow, with basic shape checks. |
| Download Config | Downloads the active YAML. |
| Dry Run | Validates the config and performs non-destructive readiness or connectivity checks where supported. Approval is not required for dry run. |
| Approved Request selector | Lets operators bind a matching approved request when the workflow is approval-mandatory. |
| Run Workflow | Submits a Workflows 1.x item through the governed legacy execution path. Standalone FCA workflows require an exact destructive acknowledgement phrase before submission. |
| Run Plan | Submits a Workflows 2.x item through the ZTF 2.x IaC plan path. Apply and destroy remain approval-bound from the ZTF 2.x IaC page. |

Workflows 1.x catalog:

| Workflow | Category | Function |
|---|---|---|
| Cluster Create | Infrastructure | Creates clusters using Foundation Central with node imaging and cluster formation through the legacy ZTF workflow lane. |
| Cluster Create (Standalone FCA) | Infrastructure | Builds and submits standalone Foundation Central Appliance Lifecycle cluster-create requests after read-only inventory validation and explicit acknowledgement. |
| Imaging Only | Infrastructure | Images nodes without forming a cluster. Useful for bare-metal preparation or re-imaging. |
| Imaging Only (Standalone FCA) | Infrastructure | Images nodes through standalone Foundation Central Appliance Lifecycle APIs after guarded validation. |
| Pod Imaging | Pod Operations | Runs a pod-oriented imaging and cluster creation flow. |
| Pod Imaging (Standalone FCA) | Pod Operations | Runs pod imaging through standalone Foundation Central Appliance Lifecycle APIs. |
| Site Deploy | Infrastructure | Handles multi-site deployment input for imaging, cluster creation, and basic configuration. |
| Site Deploy (Standalone FCA) | Infrastructure | Builds standalone FCA site deployment intents and submits guarded Lifecycle requests. |
| Configure Cluster | Configuration | Applies day-1 or day-2 Prism Element configuration such as AD, storage, networks, NTP, DNS, and HA settings. |
| Post-Foundation Baseline | Configuration | Plans and applies verified post-foundation Prism Element baseline operations where safe mappings exist. |
| PE Monitoring Baseline | Configuration | Plans monitoring, alerting, and validation evidence checks. Some controls are evidence-only or blocked until mappings are verified. |
| AHV Security Hardening | Configuration | Builds a checklist-driven hardening plan for Prism Element, CVM, and AHV controls. Only verified operations execute. |
| PE Network Baseline | Configuration | Plans and applies guarded VM network creation where mapped scripts are verified. |
| PE Certificate Baseline | Configuration | Plans certificate validation, CSR, and replacement work. Validation can be evidence-only where mutation is not mapped. |
| Hardware OOB Baseline | Configuration | Plans hardware out-of-band inventory and vendor API baseline tasks. Mutation remains blocked until vendor-supported mappings are confirmed. |
| Deploy Prism Central | Prism Central | Deploys Prism Central VM instances on target clusters. |
| Configure Prism Central | Prism Central | Configures Prism Central services such as identity, SAML, Objects, NKE, Flow, DR, and policies. |
| Pod Config | Pod Operations | Configures pod-level or edge-site infrastructure at scale. |
| Deploy Management PC | Pod Operations | Deploys Prism Central and NCM management-plane components. |
| Configure Management PC | Pod Operations | Initializes and configures management Prism Central and NCM. |
| Calm VM Workloads | Workloads | Deploys VM workloads through Calm DSL blueprint inputs. |
| Edge AI Workload | Workloads | Deploys Edge AI application workloads using workload-specific Calm inputs. |
| NDB Deploy | Services | Deploys and configures Nutanix Database Service profiles and registrations. |
| LCM Update | System | Runs lifecycle management update workflows with reviewed YAML and approval-gated execution. |

Post-foundation baseline workflows classify controls as `apply`, `evidence`,
`manual`, or `blocked`. Only verified `apply` mappings execute. Evidence-only,
manual, and blocked items are retained for review without silently mutating the
environment.

### Scripts 1.x

Use Scripts 1.x to browse and run allowlisted atomic ZeroTouch Framework 1.x
scripts.

Key functions:

| Function | Purpose |
|---|---|
| Search | Finds scripts by name or description. |
| Category filter | Limits the list to categories such as Authentication, Networking, Storage, Compute, Images, Security, Kubernetes, Database, Services, Prism Central, Prism Element, or System. |
| Select script | Adds a script to the queue. Selecting it again removes it. |
| Script Queue | Shows the ordered script list that will be passed to ZTF. |
| Move up/down | Reorders queued scripts before launch. |
| Clear | Removes all queued scripts. |
| Shared Configuration | Supplies one YAML or JSON config file to all queued scripts. |
| Script Config Wizard | Generates shared config content for selected scripts where schema support exists. |
| Run | Submits the selected script or ordered script sequence as one execution. Destructive scripts require an exact confirmation phrase. |
| Terminal output | Shows streaming execution output during the browser-bound run path. |

Use Scripts 1.x when a full workflow is too broad and an operator needs a
specific legacy ZTF script or a carefully ordered script sequence.

### Scripts 2.x

Use Scripts 2.x for converted ZTF 2.x IaC actions. These actions are not legacy
`--script` commands. They generate `input.yml`, editable `global.yml`, and a
state file name, then submit a governed `ztf2:plan` job. Apply and destroy
remain approval-bound through the ZTF 2.x IaC page.

Available converted actions:

| Action | Legacy mapping |
|---|---|
| Create Category (PC) | `CreateCategoryPc` |
| Create Project (PC) | New ZTF 2.x declarative action |
| Create Subnets (PC) | `CreateSubnetsPc` |
| Upload Image (PC) | `PcImageUpload` |
| Create VMs (PC) | `CreateVmsPc` |
| Create Security Groups (PC) | `CreateAddressGroups`, `CreateServiceGroups` |
| Create Protection Policy (PC) | `CreateProtectionPolicy` |
| Create Recovery Plan (PC) | `CreateRecoveryPlan` |

PE-only, CVM/Foundation, delete, and power actions stay in Scripts 1.x until a
reviewed ZTF 2.x resource contract is available.

## Execute Menu

### Execution History

Use Execution History to review previous workflow and script submissions.

Key functions:

| Function | Purpose |
|---|---|
| Refresh | Reloads execution records. |
| Filters | Switches between all, successful, and failed executions. |
| Expand row | Shows command, config path, return code, failure diagnostics, stderr, and stored config details where available. |
| Re-run | Starts a new run using the stored config content from a prior execution. |
| Clear All | Clears execution history after confirmation. Use carefully, because this is an operational record. |

Execution History is best for completed-run review, troubleshooting, and
repeat execution from known-good or known-failed configs.

### Jobs / Queue

Use Jobs / Queue to monitor durable background jobs.

Key functions:

| Function | Purpose |
|---|---|
| Metrics | Shows active, queued, running, failed, and interrupted job counts. |
| Filters | Switches between all, active, queued, running, failed, success, cancelled, and interrupted jobs. |
| Auto-refresh | Refreshes job state periodically. |
| Expand row | Shows worker timestamps, return code, log event count, progress, diagnostics, trace metadata, schema status, linked profile/config/approval IDs, and detected Nutanix task IDs. |
| Persisted Job Log | Displays saved stdout, stderr, start, error, and progress events. |
| Cancel | Lets admins and operators cancel queued or running jobs. |
| Delete Queue Record | Lets admins remove terminal queue records after review. Execution history and audit logs are retained. |

Use Jobs / Queue while work is running or when investigating why a job is
queued, stuck, cancelled, interrupted, or failed.

### Pipelines

Use Pipelines to chain workflows into a named, sequential deployment process.

Key functions:

| Function | Purpose |
|---|---|
| New Pipeline | Opens the pipeline builder. |
| Pipeline Name | Names the reusable sequence. |
| Add Step | Adds a workflow and optional config-file pair. |
| Workflow selector | Chooses the workflow for a step. |
| Config selector | Binds a saved config file to the step. |
| Move up/down | Reorders steps. |
| Edit | Modifies an existing pipeline definition. |
| Delete | Removes a pipeline definition. |
| Run | Starts the pipeline execution modal. |

Pipeline steps run in order. A step starts only after the prior step succeeds.
Failures halt the pipeline and remaining steps are skipped.

### Schedules

Use Schedules to automate recurring workflow or script runs.

Key functions:

| Function | Purpose |
|---|---|
| New Schedule | Creates a named recurring run. |
| Workflow / Script | Selects the workflow or script to run. |
| Cron Expression | Defines the schedule using a 5-field cron expression in UTC. |
| Presets | Inserts common cron expressions such as hourly or daily at 02:00. |
| Config | Stores YAML content to pass to the scheduled run. |
| Enabled | Turns a schedule on or off without deleting it. |
| Run now | Triggers the schedule immediately. |
| Delete | Removes the schedule. |
| Last Run / Status | Shows recent execution timestamp and result. |

Scheduled runs are useful for repeatable health checks, periodic validation, or
controlled recurring workflows. Workflows that require mandatory approvals may
be rejected from automation paths until a governance binding exists for that
surface.

### Parallel Exec

Use Parallel Exec to run the same workflow against multiple sites at the same
time.

Key functions:

| Function | Purpose |
|---|---|
| Workflow selector | Chooses the workflow each site will run. |
| Site entries | Captures labels and per-site YAML config content. |
| Add/remove site | Adjusts the set of target sites. |
| Run Parallel | Starts concurrent execution across the configured sites. |
| Per-site output | Shows terminal output for each target site independently. |
| Overall status | Summarizes the run as success, partial, or failed. |

Parallel execution is intended for repeatable multi-site work where each target
has its own reviewed config. It does not prove production completion by itself;
site-level validation and evidence remain required.

### NKP Framework

Use NKP Framework for optional NKP ZeroTouch Framework integration, deployment
profile management, readiness checks, binary registration, generated YAML, and
guarded safe-phase submission.

Tabs and functions:

| Tab | Function |
|---|---|
| Overview | Shows NKP framework status, configured path, safe phases, config inventory, and phase launcher. |
| Schema | Discovers installed NKP example YAML and infers expected schema shape from the configured framework path. |
| Templates | Provides guided deployment starters such as Management Cluster, Workload Cluster, and Air-Gapped / Local Registry. |
| Binaries | Registers or uploads NKP binaries and checks CLI compatibility. |
| Profiles | Creates, edits, validates, versions, restores, and renders NKP deployment profiles into YAML. |

Safe phases:

| Phase | Function |
|---|---|
| Validate | Performs schema, bundle, endpoint, and tooling checks. |
| Prepare | Stages NKP tools and workspace metadata. Approval may be required. |
| Generate | Creates cluster values, environment content, or helper files. Approval may be required. |
| Registry Plan | Generates private registry planning output. Approval may be required. |
| Deploy Plan | Generates deployment planning output. Approval may be required. |
| Verify | Collects local state and kubeconfig-based checks when available. |
| Runs | Summarizes NKP ZeroTouch run artifacts. |

Important boundaries:

| Boundary | Meaning |
|---|---|
| Safe-phase model | NKP actions are allowlisted and constrained. Apply, registry push, upgrade, and destroy actions are blocked server-side unless explicitly implemented later. |
| Approval-required phases | Prepare, Generate, Registry Plan, and Deploy Plan require governance approval where policy applies. |
| Profile revisions | Saved profiles are versioned. Restoring an older profile creates a new revision instead of erasing history. |
| Readiness scoring | Profiles can be ready, needs attention, or blocked based on required fields, endpoint shape, IP checks, binary paths, and YAML validity. |
| Generated YAML | The YAML is transparent and editable in Config Files so teams can align it to the exact NKP schema they adopt. |

Use NKP Framework when preparing Kubernetes platform deployment evidence or
safe-phase automation. Use Jobs / Queue to monitor submitted NKP jobs.

## Govern Menu

### Approvals

Use Approvals to create, approve, reject, and review governance requests.

Key functions:

| Function | Purpose |
|---|---|
| New Request | Creates an approval request with workflow, config, requester notes, and context. |
| Active | Shows pending approval requests. |
| History | Shows approved, rejected, expired, or completed decisions. |
| All | Shows every approval record. |
| Status filters | Narrows the list by request state. |
| Expand row | Shows full request details and decision notes. |
| Approve | Admin decision action that allows matching governed execution. |
| Reject | Admin decision action that blocks the request. |
| Delete | Removes an approval request after confirmation. |

Approval requests are used by workflow detail pages and controlled NKP phases
when mandatory approval policy is enabled.

### Appliance Ops

Use Appliance Ops to track appliance artifacts, first-boot/runtime state,
compatibility, NKP readiness, and connected or air-gapped update packages.

Major areas:

| Area | Function |
|---|---|
| Runtime and first boot | Shows appliance runtime checks, host layout state, data paths, and compatibility status. |
| Artifact archive | Records AHV appliance artifact metadata such as profile, version, checksum, and storage location. |
| Update manager | Checks GitHub update metadata, imports offline manifests, imports offline update packages, verifies package integrity, stages host-side update requests, marks updates applied, and deletes update records. |
| NKP readiness | Checks whether selected appliance profiles and framework paths are ready for NKP usage. |
| Compatibility | Displays whether configured ZTF and NKP framework paths match the supported orchestration mode. |

Actions:

| Action | Function |
|---|---|
| Refresh | Reloads appliance status and update inventory. |
| Create Artifact | Adds an archive record for a versioned appliance artifact. |
| Verify Artifact | Verifies an archive record's referenced metadata or checksum where available. |
| Delete Artifact | Admin cleanup for obsolete artifact records. |
| Check GitHub Update | Looks for connected update metadata from GitHub. |
| Import Manifest | Imports an offline update manifest. |
| Import Package | Imports an offline update package ZIP. |
| Verify Update | Validates update package metadata and integrity before staging. |
| Stage | Writes an appliance update request for host-side application. |
| Mark Applied | Records that the host-side update was applied and reviewed. |
| Delete Update | Admin cleanup for update records. |

Staging an update is not the same as applying it on the host. Host-side update
application remains an appliance operation that must be validated after the
service restarts.

### Upgrade Advisor

Use Upgrade Advisor for read-only Nutanix upgrade risk assessment.

Key functions:

| Function | Purpose |
|---|---|
| Current Versions | Captures the versions currently running in the environment. |
| Target Versions | Captures proposed target versions. |
| Evidence toggles | Records whether LCM prechecks, release notes, compatibility review, Prism Central context, dark-site bundle review, or other supporting evidence has been completed. |
| Run Assessment | Produces findings classified as blocked, warning, review, unknown, or clear. |
| Source Packs | Lets operators enable, disable, import, or delete curated rule packs. |
| Export | Downloads assessment output as an evidence bundle. |

Upgrade Advisor does not run LCM or mutate clusters. It is a structured
pre-change review tool.

### Validation Evidence

Use Validation Evidence to create and download defensible evidence records for
UAT, handover, review, and change records.

Key functions:

| Function | Purpose |
|---|---|
| Create Evidence Run | Builds an evidence record from selected source data. |
| Evidence source | Can reference an NKP profile, completed workflow/script execution, or saved config file. |
| Saved Config | Binds a config file to the evidence record. |
| Workflow / Script | Names the workflow or script under review. |
| Notes | Adds operator context for handover or UAT narrative. |
| Create Evidence | Saves the evidence archive. |
| Download | Downloads a ZIP bundle with generated summary and supporting records. |
| Delete | Admin/operator cleanup for evidence records after exact confirmation. |
| Create NKP Profile | Routes to NKP Framework when evidence needs a saved NKP profile first. |

Evidence bundles can include readiness scoring, generated YAML, config hashes,
approval/job/task references, parse results, redacted output, and Markdown
summaries depending on the selected source.

### Drift Detection

Use Drift Detection to compare intended configuration against a baseline.

Key functions:

| Function | Purpose |
|---|---|
| Config File | Selects the desired saved YAML or JSON config. |
| Workflow | Optionally associates the drift check with a known workflow. |
| Last Applied baseline | Compares the desired config to the last successful applied config known to the app. |
| Snapshot baseline | Compares the desired config to pasted current-state JSON or YAML from Prism Central, Foundation Central, or another source. |
| Run Drift Check | Records a new comparison. |
| Latest summary | Shows matched, changed, missing, and unexpected counts. |
| History | Stores prior drift runs for later review. |
| Clear | Admin action to clear drift history. |

Finding states:

| State | Meaning |
|---|---|
| Matched | Desired and observed values align. |
| Changed | The same field exists but differs. |
| Missing | Desired content is absent from the observed baseline. |
| Unexpected | Observed content was not expected by the desired config. |
| Unknown | The baseline is unavailable or the comparison cannot be made confidently. |

Use this screen before or after changes to understand whether intended
configuration still matches the known or observed environment.

### Audit Log

Use Audit Log for admin-only operational event review.

Tabs and filters:

| View | Function |
|---|---|
| Operations | Shows normal operator actions without raw routine HTTP noise. |
| Auth | Focuses on login and identity events. |
| Jobs | Focuses on job and execution activity. |
| Governance | Focuses on approval and controlled-change events. |
| Config | Focuses on config-file and YAML activity. |
| Backups | Focuses on backup and restore activity. |
| System | Includes routine system events. |
| Raw HTTP | Includes raw request-style records for debug review. |

Other functions:

| Function | Purpose |
|---|---|
| Refresh | Reloads audit data. |
| Search | Filters records by text. |
| Expand row | Shows additional structured fields for a record. |

Use Audit Log when investigating who changed settings, created approvals,
triggered jobs, changed configs, performed backups, or accessed sensitive paths.

## Admin Menu

### Users

Use Users to manage local ZTF-Orchestrator accounts and roles.

Key functions:

| Function | Purpose |
|---|---|
| User list | Shows username, role, creation timestamp, and account metadata. |
| Create User | Adds a new local account with a selected role. |
| Reset password | Opens an inline password reset form for the selected user. |
| Delete user | Removes an account after exact username confirmation. |
| Refresh | Reloads account records. |

Use admin accounts sparingly. Operators should have operator role unless they
need user management, backup restore, audit, or destructive record cleanup.

### Settings

Use Settings to configure runtime paths, storage, connection profiles,
governance policies, notifications, and installed-build traceability.

Tabs and functions:

| Tab | Function |
|---|---|
| Runtime | Configures the ZTF framework path, Python executable, config directory, NKP path, and NKP repository URL. |
| Storage | Shows backend mode, data directory or database location, retention settings, and PostgreSQL backup inventory. Admins can create, download, and restore logical backups. |
| Connections | Manages reusable connection profiles for Prism Central, Foundation Central, Prism Element/CVM, NCM/Calm, directory services, IPAM, DNS, NTP, timezone, and site defaults. |
| Governance | Selects which workflows require mandatory approved request IDs before direct execution. |
| Notifications | Configures outbound completion webhook URL. |
| About | Shows UI version and Installed Build metadata, including source ref, commit, build date, container image, and update package when reported. |

Connection profile functions:

| Function | Purpose |
|---|---|
| Add | Creates a new connection profile. |
| Duplicate | Copies the current profile as a starting point. |
| Delete | Removes the current profile after confirmation. |
| Test Connection | Tests TCP reachability for Prism Central, Foundation Central, Prism Element, NCM, directory, or IPAM endpoints. |
| Copy YAML | Copies generated ZTF defaults for the active profile. |

Storage functions:

| Function | Purpose |
|---|---|
| Refresh | Reloads health and backup inventory. |
| Create Backup | Creates a PostgreSQL logical backup when PostgreSQL storage is active. |
| Download backup | Downloads a stored backup. |
| Open Restore Confirmation | Starts a guarded restore flow. |
| Create Safety Backup and Restore | Creates a safety backup first, then restores the selected backup after exact confirmation. |

About functions:

| Function | Purpose |
|---|---|
| Refresh | Reloads runtime health and installed build details. |
| Copy Build Info | Copies version, ref, commit, image, and update-package metadata for support or UAT records. |
| Open Applied Release | Opens the release URL when an applied update reports one. |

Use Installed Build from Settings > About when confirming exactly which patch,
container image, or appliance update is running. The footer version alone may
not distinguish patched builds that share the same UI version.

## Safety And Governance Notes

ZTF-Orchestrator is designed for trusted internal networks, not direct internet
exposure. Use a TLS reverse proxy and environment-specific hardening before
team or UAT use.

Execution paths enforce workflow and script allowlists, session authentication,
role checks, approval gates where enabled, YAML parsing, confirmation prompts
for destructive actions, and durable job records. These controls reduce the
chance of accidental mutation but do not replace customer-specific UAT,
backups, change approval, or infrastructure rollback planning.

Standalone Foundation Central Appliance workflows submit Lifecycle requests to
FCA after validation and acknowledgement. An accepted handoff means the request
was accepted by the FCA lane; operators must still monitor Foundation Central
and collect evidence for actual imaging or cluster-completion status.

## Where To Look During An Incident

| Symptom | First screens to check |
|---|---|
| Framework not detected | Dashboard, Setup & Install, Settings > Runtime, Appliance Ops. |
| Workflow cannot run | Workflow detail page, Settings > Governance, Approvals, Config Files, Jobs / Queue. |
| Job appears stuck | Jobs / Queue expanded log, detected task IDs, Audit Log, target Nutanix task UI. |
| Approval missing | Approvals, Settings > Governance, Workflow detail approved request selector. |
| Config changed unexpectedly | Config Files history, Drift Detection, Audit Log > Config. |
| Appliance update uncertain | Appliance Ops update record, Settings > About Installed Build, Settings > Storage backup state. |
| UAT evidence missing | Validation Evidence, Execution History, Jobs / Queue trace metadata, Config Files. |
