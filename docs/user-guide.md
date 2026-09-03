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

For Native Foundation Deploy, the workflow detail page adds read-only review
phase status and readiness phase selection from
`GET /api/native-foundation/phases`, a phase advancement selector backed by
`POST /api/native-foundation/phases/advancement-review`, plus actions for
plan, discovery, image, network, secret, cluster formation,
post-create validation, secret-store binding, secret-store provider contract,
secret lease, secret audit persistence, execution admission, adapter contract, execution
request, dry-run ledger, topology matrix, permit review, lock plan, audit plan, retention plan,
provider operation catalog, provider operation admission,
provider operation queue plan,
provider operation queue admission,
runner readiness, UAT entry, UAT entry issuance, UAT start readiness, UAT start
persistence admission, UAT runner admission, UAT runner persistence admission,
UAT execution authorization, authorization persistence admission, UAT scope, UAT runbook, UAT security,
UAT Ops, UAT signoff, recovery, job state, submission gate, request persistence admission,
submission persistence admission, queue persistence, queue admission, adapter binding, UAT lane, lane admission, UAT hardware
reservation, reserve admission, UAT issue, entry admission, UAT start, start
admission, UAT admit, runner persist, UAT completion, auth persist, req persist, sub persist, review packet, evidence capture, approval binding, promotion, UAT
checklist artifacts, and a durable Queue Review Job
rehearsal, activation, registry, allow-list, load plan, package, and SBOM
reviews plus runtime isolation and runtime admission review. Lock, audit, and
retention reviews carry retained-export and secret-audit prerequisite status
without acquiring locks, appending audit records, or persisting artifacts.
Runner Readiness carries retained-export and secret-audit blockers into the
final pre-start review without starting jobs. UAT Entry carries those
retained-export and secret-audit prerequisites plus the controlled UAT signoff
requirement and controlled UAT hardware reservation review into the bounded
hardware-UAT decision record without authorizing UAT. UAT Scope carries retained-export and
secret-audit prerequisite artifacts plus packet output/export gate summaries
into the bounded site, cluster, node, provider, and topology scope without
reserving hardware. UAT Rehearsal
generates provider, deployment, evidence, and artifact cases for controlled
hardware testing. The review job writes persisted logs and history only.
Dry-Run Ledger records graph steps and expected evidence outputs without
running adapters. Permit Review binds the request, ledger, recovery, job state,
retained-export prerequisite, secret-audit prerequisite, approval, evidence,
and registry draft without issuing a permit.
Secret Binding declares future lease, audit, RBAC, and adapter handoff records
without resolving secret values. Secret Provider reviews future provider
contract metadata without opening leases, reading secret paths, resolving
values, or handing credentials to adapters. Secret Lease records future lease
owner, policy, audit sink, adapter identity, and revocation metadata without
opening leases or resolving values. Secret Audit records future audit sink,
retention, and failure-classification metadata without appending events,
reading retained artifacts, or persisting evidence. Lane Admit composes
selected lanes, queue-admission provenance, authorization-persistence
provenance, controlled UAT completion gate summaries, job persistence
admission, adapter binding, and scope controls into a disabled lane persistence
admission record before hardware reservation can be considered. Reserve Admit
composes hardware
reservation, queue-admission provenance, authorization-persistence provenance,
controlled UAT completion gate summaries, signoff, operations, and UAT evidence
acceptance into a disabled reservation persistence admission record before UAT
entry issuance can be considered. UAT Entry composes the final bounded hardware-UAT entry blockers, including the
non-persisted controlled UAT signoff requirement and non-persisted hardware
reservation review, without authorizing testing, loading adapters, opening
maintenance windows, or starting jobs. Entry Admit composes entry issuance,
reservation persistence admission, queue-admission provenance,
authorization-persistence provenance, controlled UAT completion gate summaries,
signoff, runbook, and UAT evidence acceptance into a disabled entry
persistence admission record before controlled UAT start can be considered.
UAT Scope declares the selected site, cluster, node, provider, topology,
evidence, artifact, packet output/export gate, and policy scope without
reserving hardware or authorizing UAT.
UAT Runbook reviews UAT window, rollback owner, evidence-retention target,
retained-export prerequisite, secret-audit prerequisite, packet output/export
gate summary, and operator steps without approving UAT.
UAT Security reviews security reviewer metadata, private security review
reference, secret boundaries, retained-export prerequisite, secret-audit
prerequisite, packet output/export gate summary, audit/retention posture, and
disabled adapter registry state without approving UAT.
UAT Ops reviews operations owner metadata, private maintenance/change ticket,
backup or restore evidence reference, retained-export prerequisite,
secret-audit prerequisite, packet output/export gate summary, recovery posture,
retention posture, and future lock scope without approving UAT or reserving
hardware.
UAT Signoff composes scope, runbook, security, operations, UAT evidence
acceptance, allow-list, retained-export prerequisite, secret-store provider
contract, secret audit persistence, and packet output/export gate summary
reviews plus private signoff metadata without persisting signoff, issuing UAT entry, loading
adapters, or starting jobs.
Allow-List Review turns disabled registry draft entries into read-only
allow-list approval artifacts without persisting entries, loading adapters, or
starting jobs.
Load Plan turns allow-list, controlled UAT signoff, retained-export
prerequisite, secret audit persistence, and packet output/export gate summary
artifacts into read-only adapter load entries without reading packages,
importing code, handing credentials to adapters, or starting runners.
Package Review records adapter package owner, private package reference, SHA256,
signature reference, signer, retained-export prerequisite, secret-audit
prerequisite, and packet output/export gate summary metadata without reading
packages, hashing bytes, verifying signatures, staging files, or importing code.
SBOM Review records adapter SBOM owner, private SBOM reference, SBOM format,
SHA256, vulnerability scan reference, retained-export prerequisite,
secret-audit prerequisite, and packet output/export gate summary metadata
without generating SBOMs, reading SBOMs, parsing component inventories,
scanning packages, staging files, exporting retained evidence, persisting secret
audit entries, or importing code.
Runtime Review records adapter runtime owner, isolation profile, sandbox image,
network policy, filesystem policy, retained-export prerequisite, and
secret-audit prerequisite plus packet output/export gate summary metadata
without creating sandboxes, applying policies, registering hooks, handing
credentials to adapters, exporting retained evidence, persisting secret audit
entries, or starting adapter processes.
Runtime Admit records adapter runtime admission owner, approval reference,
change ticket, exception reference, retained-export prerequisite, and
secret-audit prerequisite plus packet output/export gate summary metadata
without admitting runtimes, loading adapters, handing credentials to adapters,
exporting retained evidence, persisting secret audit entries, submitting
mutating jobs, or contacting deployment targets.
Exec Preflight records adapter execution preflight owner, evidence, command,
connectivity, rollback, retained-export prerequisite, and secret-audit
prerequisite plus packet output/export gate summary metadata without running
commands, resolving secrets, opening target connections, exporting retained
evidence, persisting secret audit entries, or submitting jobs.
Target Links records connectivity owner, connectivity scope, target allow-list,
maintenance window, probe plan, retained-export prerequisite, and secret-audit
prerequisite plus packet output/export gate summary metadata without opening
sockets, authenticating, resolving secrets, running probes, exporting retained
evidence, persisting secret audit entries, or contacting targets.
Secret Lease records lease owner, policy, audit sink, adapter identity, and
revocation references without authenticating to a secret store, opening leases,
resolving values, persisting audit events, or handing credentials to adapters.
Credential Gate records credential handoff owner, secret lease policy, adapter
identity, redaction policy, retained-export prerequisite, and secret-audit
prerequisite plus packet output/export gate summary metadata without opening
leases, resolving secrets, exposing values, handing credentials to adapters,
exporting retained evidence, or persisting secret audit entries.
Command Gate records command owner, command catalog, invocation policy,
execution identity, output capture, retained-export prerequisite, and
secret-audit prerequisite plus packet output/export gate summary metadata
without assembling commands, writing command files, invoking adapters,
capturing live output, exporting retained evidence, or persisting secret audit
entries.
Output Gate records output evidence owner, retention, redaction, failure
classification, evidence-store, controlled UAT completion requirement,
retained-export prerequisite, and secret-audit prerequisite plus packet
output/export gate summary metadata without capturing stdout or stderr, writing
artifacts, persisting evidence, exporting retained evidence, persisting secret
audit entries, or classifying live failures.
Export Gate records retained evidence export owner, request, retention store,
RBAC review, checksum manifest, controlled UAT completion requirement,
output-evidence prerequisite artifacts, and source review statuses plus packet
output/export gate summary metadata without reading artifacts, generating ZIPs,
writing checksums, persisting evidence, or exporting retained evidence.
Lock Plan declares future orchestration, site, cluster, and adapter locks
without acquiring them. Audit Plan declares future audit events, retained
evidence artifacts, and packet output/export gate summary records without
writing audit records. Retention Plan declares future retention policies, backup
targets, and restore checks without persisting artifacts. Runner Readiness
composes final permit, lock, audit, retention, packet output/export gate,
secret, registry, activation, and controlled-UAT blockers without starting a
runner. Activation Review checks the final evidence and
approval package without enabling adapters. Registry Review drafts disabled provider/deployment
registry entries for the current plan without persisting status changes. The
Execution Disabled button is intentional until controlled adapter UAT proves
mutating deployment paths.

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
| Native Foundation Deploy | Infrastructure | Plans Orchestrator-owned multi-site, heterogeneous cluster deployment intents for HCI, compute-only, storage-only, and mixed topology design. Execution is disabled until native adapters are validated. |
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

Native Foundation Deploy is different from the FCA handoff workflows. It is the
planning-only foundation for Orchestrator-owned deployment tasks across multiple
sites, hardware providers, and cluster deployment types. Dry Run validates the
intent shape; Run Workflow remains disabled until execution adapters have
controlled UAT evidence. The read-only discovery preview API normalizes
operator-supplied intent into site, cluster, and node facts without contacting
BMCs or changing infrastructure. Discovery Contract defines provider-specific
request, response, and evidence requirements for future live discovery adapters
without contacting hardware providers. Discovery Reconcile compares supplied
adapter-style discovery facts with the intended node plan and flags missing,
unexpected, mismatched, incomplete, or secret-bearing facts without promoting
execution. Generate Plan computes deterministic plan, intent, and discovery hashes plus approval metadata for future adapter-bound
execution. Execution Readiness reports the UAT evidence gates that must pass
before imaging-only or cluster-create adapters can be enabled. Image Sources
reviews operator-supplied AOS and hypervisor references, versions, and
SHA256-shaped checksums without staging images. Imaging Plan builds per-node
Foundation payload previews from image, network, credential-reference, and
discovery-reconciliation metadata without imaging nodes. Formation Plan builds
cluster-level payload previews for HCI, compute-only, storage-only, and mixed
topologies without creating clusters or registering nodes. Post-Create Plan
builds Prism Element and topology validation payload previews without contacting
live clusters. Topology Support creates fail-closed support records for HCI,
compute-only, storage-only, and mixed provider/topology pairs without enabling
mutating support. Network Manifest reviews VIP,
BMC, host, CVM, gateway, DNS, NTP, duplicate IP, and subnet membership metadata
without configuring networks. Secret Refs reviews named provider and BMC
credential references and inline secret-like fields without resolving or
exposing secret values. Secret Plan inventories future secret-store resolution
requests without reading, decrypting, or exposing secret values. Execution Graph previews the read-only
orchestration order for site waves, cluster waves, dependencies, and
deployment-type-specific actions. Adapter Contracts reviews
the versioned read-only provider and deployment contract registry for the
current intent. Provider Adapters shows the read-only operation scaffold for
future discovery, power, boot, image mount, and imaging adapters. Provider
Preflight composes provider, credential reference, BMC address, image, and
network metadata for live-discovery UAT review without contacting providers.
Adapter Readiness reports cluster-scoped provider/topology capability blockers and
missing UAT evidence. Deployment Policy checks site windows, max parallelism,
approval binding, evidence requirements, and failure behavior before any future
scheduling. Deployment Wave Gates turn those policy checks into per-wave,
per-site scheduling gate records without reserving windows or opening waves.
Deployment Wave Rehearsal packages those gates with evidence packs, recovery
actions, runner blockers, go/no-go controls, and blast-radius metadata without
starting execution or reserving windows.
Wave Authorize composes rehearsed waves, pack approval, permit reviews, lock
plans, runner blockers, recovery references, and blast-radius metadata without
persisting authorization, acquiring locks, or starting execution.
Window Reserve turns wave authorization, deployment windows, and site/cluster
lock requests into read-only reservation records without persisting
reservations, acquiring locks, or opening waves.
Schedule Review turns reservation records, execution requests, dry-run ledgers,
permits, locks, recovery actions, and job-state plans into disabled schedule
items without opening waves or enqueuing jobs.
Admission Review composes readiness, adapter, policy, approval, evidence,
controlled UAT completion, and auth-persistence completion-gate checks before
any future native Foundation execution start. Execution
Contract builds deterministic future adapter request envelopes with controlled
UAT completion gate metadata without loading or running adapters. Request
Review builds the future execution submission object with controlled UAT
completion gate summaries without creating a job. Recovery Plan reviews stop,
retry, rollback,
checkpoint, evidence, retained-export, secret-audit prerequisite, and packet
output/export gate summary actions without executing recovery. Job State Plan models queue, running, checkpoint,
pause, failure, recovery, retained-export prerequisite, and secret-audit
prerequisite state plus packet output/export gate summaries without persisting durable job state. Evidence Packs prepares one read-only review record per cluster
with plan hashes, graph step IDs, readiness gates, and contract requirements.
Restart Resume composes checkpoint, job-state, retention, audit, lock, and
scheduler metadata into disabled replay records without restoring checkpoints
or replaying queues.
Backup Restore composes retention targets, restore rehearsal checks,
checkpoint, job-state, audit, and restart/resume metadata into disabled
disaster-recovery records without creating backups or restoring state.
Mutating Gate composes runner, backup/restore, controlled UAT signoff,
controlled UAT execution authorization, carried authorization-persistence
provenance, runtime, preflight, connectivity, credential, command, output
evidence, and retained export reviews into a disabled execution-enable gate
without authorizing execution or enabling deployment.
Submission Gate builds future per-wave job submission records from mutating
enablement, carried authorization-persistence enablement gate status, request
persistence admission, controlled UAT completion and auth-persistence
completion-gate summaries, scheduler, runner readiness, and controlled UAT
entry reviews without enqueueing jobs or enabling deployment.
Req Persist declares future execution request persistence admission records from
request envelopes plus controlled UAT completion and auth-persistence
completion-gate summaries without persisting request state, enqueueing jobs,
submitting jobs, starting runners, or mutating hardware.
Sub Persist declares future execution submission persistence admission records
from submission envelopes and carried authorization-persistence enablement gate
status plus controlled UAT completion gate summaries without persisting
submission state, queue records, replay registrations, submitted jobs, or
worker state.
Queue Persist declares future durable queue records from submission persistence
admission, carried authorization-persistence enablement gate status, controlled
UAT completion gate summaries, job-state, audit, retention, and restart/resume
reviews without persisting queue state, registering replay, or enqueueing jobs.
Queue Admit declares future queue persistence admission records from queue
persistence review, carried authorization-persistence enablement gate status,
and controlled UAT completion gate summaries without admitting persistence,
persisting queue state, registering replay, enqueueing jobs, or persisting job
state.
Auth Persist declares future execution authorization persistence admission
records from controlled UAT execution authorization, runner persistence
admission, carried queue-admission provenance, and carried
authorization-persistence enablement gate status, controlled UAT completion
gate summaries, and authorization-persistence provenance when present. It
preserves a disabled placeholder cycle breaker until real authorization records
exist, without persisting authorization, writing job state, or submitting jobs.
Persist Admit declares future durable job, queue, checkpoint, authorization,
audit, retention, replay, and submitted-job admission records from queue
persistence admission, carried authorization-persistence enablement gate status,
controlled UAT completion gate summaries, authorization persistence admission,
and carried authorization queue-admission plus authorization-persistence
provenance when present without writing state, registering replay, or submitting
jobs.
Adapter Bind declares future mutating adapter binding records from queue
persistence admission, job persistence admission, carried
authorization-persistence enablement gate status, controlled UAT completion
gate summaries, authorization persistence admission provenance, carried
authorization-persistence provenance, activation, allow-list, runtime,
preflight, connectivity, credential, plan hash, approval, and UAT evidence
metadata without persisting job state, persisting authorization, loading, or
executing adapters.
UAT Lane declares bounded provider, deployment-type, site, queue-admission,
authorization-persistence, carried authorization-persistence enablement gate
status, controlled UAT completion gate summaries, carried
authorization-persistence, and adapter-binding lane records without persisting
lane selection, reserving hardware, or issuing UAT entry.
Lane Admit declares future lane persistence admission records from lane
selection, queue-admission provenance, authorization-persistence provenance,
carried authorization-persistence enablement gate status, controlled UAT
completion gate summaries, carried authorization-persistence provenance, job
persistence admission, adapter binding, and scope reviews without persisting
selections, admitting hardware reservation, reserving hardware, or issuing UAT
entry.
UAT Reserve declares future controlled hardware reservation records from UAT
lane persistence admission, queue-admission provenance,
authorization-persistence provenance, carried authorization-persistence
enablement gate status, controlled UAT completion gate summaries, carried
authorization-persistence provenance, deployment windows, scheduler items,
locks, and operations review without persisting reservations or opening
maintenance windows.
Reserve Admit declares future reservation persistence admission records from
hardware reservation, queue-admission provenance, authorization-persistence
provenance, carried authorization-persistence enablement gate status,
controlled UAT completion gate summaries, carried authorization-persistence
provenance, signoff, operations, and UAT evidence reviews without persisting
reservations, opening maintenance windows, reserving hardware, or issuing UAT
entry.
UAT Issue assembles future controlled UAT entry issuance records from entry,
hardware reservation, reservation persistence admission, queue-admission
provenance, authorization-persistence provenance, carried
authorization-persistence enablement gate status, controlled UAT completion
gate summaries, carried authorization-persistence provenance, signoff, and
evidence acceptance reviews without persisting or issuing UAT entry.
Entry Admit declares future entry persistence admission records from entry
issuance, reservation persistence admission, queue-admission provenance,
authorization-persistence provenance, carried authorization-persistence
enablement gate status, controlled UAT completion gate summaries, carried
authorization-persistence provenance, signoff, runbook, and evidence
acceptance reviews without persisting entry, issuing UAT entry, starting UAT,
or starting runners.
UAT Start declares future controlled UAT start readiness records from entry
persistence admission, queue-admission provenance, and
authorization-persistence provenance plus carried authorization-persistence
enablement gate status, controlled UAT completion gate summaries, and carried
authorization-persistence provenance controls without starting runners,
adapters, or Foundation calls.
Start Admit declares future controlled UAT start persistence admission records
from start readiness, entry persistence admission, queue-admission provenance,
authorization-persistence provenance, carried authorization-persistence
enablement gate status, controlled UAT completion gate summaries, carried
authorization-persistence provenance, and lock controls without persisting
start state, starting UAT, or starting runners.
UAT Admit declares future controlled UAT runner admission records from start
persistence admission, queue-admission provenance, authorization-persistence
provenance, carried authorization-persistence enablement gate status,
controlled UAT completion gate summaries, carried authorization-persistence
provenance, runtime admission, runtime isolation, and runner readiness reviews
without admitting runtimes, starting runners, executing adapters, or mutating
hardware.
Runner Persist declares future controlled UAT runner persistence admission
records from runner admission, start persistence admission, and
queue-admission, authorization-persistence, and carried
authorization-persistence enablement gate status plus controlled UAT
completion gate summaries and carried authorization-persistence provenance
controls without persisting admission, admitting runners, or starting runners.
UAT Authorize declares future controlled UAT execution authorization records
from runner persistence admission, queue-admission provenance, carried
authorization-persistence enablement gate status, controlled UAT completion
gate summaries, carried authorization-persistence provenance, preflight, target
connectivity, credential handoff, command invocation, and output evidence
reviews without invoking adapters, capturing output, submitting jobs, or
mutating hardware.
UAT Completion declares future controlled UAT completion records from execution
authorization, controlled UAT completion gate summaries, output evidence,
retained evidence export, signoff, and evidence acceptance reviews without
marking UAT complete, promoting adapters, certifying production support, or
submitting jobs.
UAT Evidence maps provider and deployment-type requirements to accepted
`foundation_engine.uat_evidence` IDs and approval/evidence bindings without
persisting acceptance or enabling deployment.
Pack Approval binds each evidence pack to Approval Gate, Validation Evidence,
accepted UAT evidence, and per-cluster go/no-go review records without
persisting decisions or enabling execution.
Resume Checkpoint previews restart position from the current graph plus optional
completed or failed step IDs in the intent. Promotion Review reports the
software and UAT blockers for a provider/topology before any mutating adapter can
be promoted. Activation, registry enablement, allow-list review, load-plan
review, package provenance review, SBOM review, runtime isolation review,
runtime admission review, execution preflight review, and target connectivity
review, credential handoff review, command invocation review, output evidence
review, and retained export review all require controlled UAT completion before
any future adapter enablement, package approval, SBOM approval, runtime
isolation approval, runtime admission approval, execution preflight approval,
target connectivity approval, credential handoff approval, command invocation
approval, output evidence approval, or retained export approval can be
considered.
UAT Checklist prepares scoped read-only test cases and required evidence fields for controlled hardware validation. Review Packet downloads a
redacted ZIP containing the review artifacts, output/export gate summary, and
SHA256 manifest, including carried authorization-persistence enablement and
controlled UAT completion gate counts, including execution authorization
persistence admission completion-gate counts. Capture Evidence stores the selected
phase, optional approval ID, redacted review packet manifest, carried
authorization-persistence gate metadata, controlled UAT completion gate
metadata, provider/topology matrix status and counts, and hashes in Validation
Evidence for later UAT or approval review. It also stores provider operation
catalog, provider operation admission, and provider operation queue plan
status/counts plus provider operation queue admission status/counts so future
operation readiness can be reviewed from the captured packet.
The returned Validation Evidence record ID is the
`evidenceId` used by later Foundation reviews. Approval Binding compares the
current plan with an approved `native-foundation-deploy` Approval Gate request
and captured native Foundation Validation Evidence record, then reports any
missing or mismatched binding, including missing controlled UAT completion gate
metadata and execution authorization persistence admission completion-gate
metadata, while keeping execution disabled. Admission Review carries the
captured packet output/export, controlled UAT completion gate summary, and
auth-persistence completion-gate metadata into each selected cluster decision,
adapter request envelope, and future execution request object without allowing
the runner to start. Execution Contract builds deterministic future adapter
request envelopes with controlled UAT completion and auth-persistence
completion-gate metadata without loading or running adapters. Dry-Run Ledger carries that gate summary
onto each matching graph step while keeping every step recorded-not-executed.
Permit Review binds the same packet gate summary into the non-issued permit
package without allowing permit issuance. Lock Plan carries the packet gate
summary into adapter lock metadata without acquiring locks or reserving windows.

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
