# Changelog

All notable changes to ZTF-Orchestrator are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

Changes in this section are present on `main` after v1.5.6 and should be moved
into the next numbered release section when the next version is cut.

---

## [1.5.6] - 2026-07-22

### Summary
DEV_LAB validation hardening release for Prism Element script execution,
covering real disposable storage-container create/delete behaviour, PE wizard
schema compatibility, and stronger destructive-action safeguards.

### Added
- Documented sanitized Nutanix Community Edition lab evidence for successful
  Prism Central software upload and VM deployment with `pc.2024.3.1.14`.
- Added DEV_LAB validation evidence and a disposable storage-container
  validation runbook for `CreateContainerPe` followed by `DeleteContainerPe`.
- Added script wizard schema-contract coverage proving all 75 examples generate
  parseable YAML and PE examples emit runtime-compatible cluster keys.

### Fixed
- Fixed Deploy Prism Central YAML generation to emit the upstream ZTF 1.x
  `pc_configs` contract with cluster-level PE and CVM credential references.
- Made the PC version editable in the Deploy Prism Central form and added
  `pc.2024.3.1.14` as a suggested version.
- Marked queued ZTF jobs as failed when process output contains ZTF `[ERROR]`
  or `[CRITICAL]` lines even if the runtime exits with status code `0`.
- Mirrored the durable `global.yml` into the bundled ZTF runtime path before
  workflow execution and surfaced mirror permission failures.
- Patched bundled ZTF DeployPC helpers for top-level CVM credential fallback and
  metadata-file download verification.
- Fixed PE script wizard output to use `clusters.<pe_ip>.name` rather than the
  stale `cluster_name` key rejected by ZTF runtime schema validation.
- Fixed `CreateRoleMappingPe` wizard YAML to include the full schema-required
  `directory_services` block.
- Fixed `DeleteContainerPe` and `DeleteSubnetsPe` wizard YAML so ZTF
  create-style schema requirements are satisfied before delete execution.
- Changed PE container wizard examples to default to `replication_factor: 1`
  with guidance to match the production cluster's RF policy.

### Security
- Expanded destructive-script backend enforcement and regression coverage so
  delete and high-risk PE/PC actions require explicit confirmation through both
  immediate execution and queued jobs.

---

## [1.5.5] - 2026-07-06

### Summary
Operator-safety release for the script wizard and air-gapped upgrade flow,
adding generated guidance, stronger failed-run diagnostics, destructive action
confirmation, and a repeatable offline package builder.

### Added
- Added generated per-script YAML example values and required-field guidance to
  the script configuration wizard.
- Added failed-run diagnostics that persist the redacted command, config file,
  config path, return code, stderr/stdout tails, failure category, evidence, and
  likely fix in jobs and execution history.
- Added destructive script metadata and confirmation handling for delete,
  destroy, disconnect, update, and power-transition style operations.
- Added a one-command air-gapped release helper that runs release checks, builds
  the UI and image, smoke-tests `/health`, verifies runtime patches, exports the
  image tar, and creates the offline update ZIP with checksums.
- Added a full validation test plan for proving all 75 script wizard schemas
  against real ZeroTouch Framework behavior.

### Changed
- Improved the script page workflow so destructive queued scripts require an
  exact operator confirmation phrase before submission.
- Improved execution and job detail views with actionable diagnostics instead
  of requiring operators to inspect raw logs first.

### Security
- Enforced destructive-script acknowledgement on the backend so API clients
  cannot bypass the UI prompt.
- Redacted sensitive command and diagnostic values for common password, token,
  secret, and API-key markers before persistence/display.

---

## [1.5.4] - 2026-07-02

### Summary
Patch release for v1.5.3 follow-up hardening, aligning script execution labels
with real ZeroTouch Framework class names and reducing manual air-gapped update
packaging errors.

### Added
- Added explicit Prism Element and Prism Central script entries for operations
  whose legacy UI aliases were ambiguous, including VM create/delete/power
  operations.
- Added release consistency and script-catalogue validation coverage.
- Added an offline update package generator for producing a manifest, image
  tar, checksum file, and zip package from a reviewed container image tar.
- Added a script configuration wizard that generates starter YAML for common
  ZTF script operations from operator-friendly form inputs.

### Changed
- Updated the in-app logo and SVG favicon to adapt to dark and light modes.
- Excluded exported `.tar`, `.tar.gz`, and `.zip` artifacts from Docker build
  context.

### Fixed
- Fixed backend `/health` version reporting so the API, UI, package metadata,
  README, and changelog agree on the release version.
- Fixed stale script aliases such as `CreateVm` by using real ZTF v1.5.2 script
  class names such as `CreateVmPe` and `CreateVmsPc`.
- Rejected ambiguous legacy script aliases with operator guidance instead of
  guessing PE versus PC behavior.
- Patched the bundled ZTF v1.5.2 PC entity list helper during image build so
  `CreateVmsPc` filter-based VM lookups no longer raise `KeyError: 'filter'`.
- Fixed the `CreateVmsPc` wizard output to use the runtime's expected
  `network`, `ip_endpoint_list`, and `num_vcpus_per_socket` fields.
- Patched the bundled ZTF v1.5.2 PC VM payload helper during image build so
  `CreateVmsPc` uses the requested VM name instead of the helper template's
  default `test-payload` name.

---

## [1.5.3] - 2026-07-01

### Summary
Patch release for appliance update safety after AHV UAT upgrade validation,
ensuring future in-place upgrades create host-side state backups before restart.

### Added
- Added mandatory pre-update PostgreSQL dump creation to the appliance update
  helper.
- Added a pre-update `/var/lib/ztf-orchestrator` data directory snapshot to the
  appliance update helper.
- Added post-upgrade state validation and recovery checks to the Appliance
  Update Manager guide.

### Changed
- Updated the validated AHV appliance air-gapped upgrade documentation for the
  v1.5.3 state-preservation flow.
- Improved image upload behavior and dashboard description copy.

### Fixed
- Reduced risk of execution history, config, approval, or backup inventory loss
  during future appliance image updates by failing closed when pre-update state
  backups cannot be created.

---

## [1.5.2] - 2026-06-30

### Summary
Patch release for production hardening after UAT workflow validation, adding
mandatory approval policy controls, file-backed job persistence hardening, and
separate validation records for PostgreSQL restore, non-NKP evidence,
Foundation Central imaging, and ZTF 2.x planning.

### Added
- Added configurable mandatory approval policies for high-impact ZTF workflows.
- Added Settings > Governance controls for selecting approval-mandatory
  workflows.
- Added approval ID support to direct workflow execution.
- Added sanitized UAT evidence guidance for non-NKP workflows.
- Added a safe PostgreSQL backup/restore drill record pattern.
- Added a separate Foundation Central cluster-create and imaging validation
  path.
- Added a separate ZTF 2.x plan/apply roadmap.

### Changed
- Schedules, pipelines, and parallel runs now reject workflows marked as
  approval-mandatory until those automation surfaces have explicit approval
  binding.

### Fixed
- Hardened file-backed JSON persistence with per-file write locks and bounded
  `os.replace` retry handling for transient Windows file locks.

---

## [1.5.1] - 2026-06-25

### Summary
Patch release for the v1.5 appliance update line, adding community project
metadata and fixing bodyless artifact verification requests in the Appliance
Operations UI.

### Fixed
- Fixed Appliance artifact verification returning HTTP 415 when the UI posted
  to the verify endpoint without a JSON body.
- Hardened file-backed JSON writes to avoid partial reads while background
  workers update job state.

### Added
- Added a repository Code of Conduct.
- Added contributor guidance covering development setup, testing expectations,
  security review triggers, appliance changes, and release/version alignment.
- Added a GitHub pull request template aligned with the repository definition
  of done.

---

## [1.5.0] - 2026-06-24

### Summary
Minor release adding enterprise air-gapped update package handling for
ZTF-Orchestrator appliance updates.

### Added
- Added offline update package import for zip packages containing
  `manifest.json` and checksum-verified container image or framework archive
  artifacts.
- Extended staged update requests and the host helper to carry verified
  artifact paths, validate SHA-256 checksums, load offline container image
  tars, and apply framework archives with a host-side backup.
- Added Appliance Operations UI controls for importing offline update packages
  and viewing staged package artifacts.

### Security
- Update package extraction now rejects traversal paths, enforces configured
  upload and extraction size limits, stores artifacts in appliance data
  staging, and cleans failed imports.

---

## [1.4.1] - 2026-06-22

### Summary
Patch release that aligns the runtime, documentation, and container package
version with the post-v1.4.0 update-management and light-theme fixes already
present on `main`.

### Fixed
- Improved light theme contrast for workflow cards, category badges, muted
  helper text, form labels, secondary controls, alert panels, inline code chips,
  accent status text, and tab states across the main application pages.

### Added
- Added an Appliance Update Manager for connected GitHub release discovery,
  offline update manifest import, verification, staging, applied-state tracking,
  and host-side update request generation.
- Added a privileged appliance host helper script for applying staged
  ZTF-Orchestrator container updates with `.env` backup and optional offline
  Docker image tar loading.
- Extended the Appliance Update Manager to stage ZeroTouch Framework and NKP
  Framework git checkout updates from allowlisted repositories.

---

## [1.4.0] - 2026-06-20

### Summary
Operational appliance management release: adds an appliance operations surface
for AHV artifact retention, first-boot validation, NKP readiness review, ZTF
compatibility visibility, and optional visual smoke testing.

### Added
- Appliance artifact archive manager for standard, airgap, and minimal AHV
  QCOW2 records, including archive location, SHA-256 checksum, expiry,
  verification status, and RBAC-protected CRUD APIs.
- First-boot appliance status checks for expected source, install, Compose,
  environment, firstboot log, NKP framework, and NKP bundle paths.
- Guided NKP deployment readiness checklist view that runs the existing
  server-side profile readiness evaluation from a dedicated appliance page.
- ZTF compatibility mode endpoint and UI showing current legacy ZTF 1.x support
  and the planned separate ZTF 2.x plan/apply mode boundary.
- Optional Playwright visual smoke tests for login rendering, dashboard theme
  toggle, and Appliance Operations navigation.

---

## [1.3.1] - 2026-06-20

### Summary
Follow-up release for the v1.3 appliance line: adds dashboard theme selection
and documents how to retain generated AHV QCOW2 artifacts outside GitHub
Actions before artifact expiry.

### Added
- Added an optional System/Dark/Light dashboard theme selector with persisted
  user preference and early page bootstrap to avoid a flash of the wrong theme.
- Documented the recommended durable archive process for standard, airgap, and
  minimal AHV QCOW2 artifacts generated by GitHub Actions.

---

## [1.3.0] - 2026-06-19

### Summary
AHV appliance distribution release: the project now supports named appliance
artifact profiles, a successful AHV QCOW2 build workflow, and a documented
import/configuration runbook for connected and air-gapped use.

### Added
- AHV appliance artifact profiles for `standard`, `airgap`, and `minimal`
  builds, plus an `all` workflow option that publishes multiple QCOW2 variants
  as separate GitHub Actions artifacts.
- Successful prebuilt AHV QCOW2 appliance path with baked ZTF-Orchestrator,
  ZeroTouch Framework v1.5.2, PostgreSQL image preload, and optional NKP
  framework staging for disconnected-site preparation.
- Dedicated AHV appliance import and configuration guide covering artifact
  download, checksum verification, Prism image upload, VM sizing, administrator
  access, firstboot checks, UI login, NKP path registration, and
  troubleshooting.
- NKP Deployment Template Packs for Management Cluster, Workload Cluster, and
  Air-Gapped / Local Registry profile starts, including required fields,
  optional fields, and operator preflight checklists.
- Template-aware NKP YAML previews, persisted template metadata, and readiness
  rules for management, workload, and air-gapped deployment packs.
- NKP example discovery, schema inference from installed `configs/environments`
  examples, schema validation for generated YAML, and example-to-profile import.
- NKP deployment profile versioning with append-only revision history and
  restore-to-new-revision support.
- Execution traceability for NKP jobs, linking queue records to profile ID,
  profile revision, template, generated config, approval ID, schema status, and
  detected Nutanix task IDs where available.
- Admin delete action for terminal Jobs / Queue records, with active queued or
  running jobs protected from deletion.
- NKP v2.17 alignment matrix documenting supported areas, partial areas,
  planned gaps, and required infrastructure UAT before production claims.
- NKP CLI compatibility checker for registered binaries, including version,
  Nutanix cluster creation help, Image Builder help, and bundle push help.
- Expanded NKP deployment profiles with proxy/no-proxy, air-gapped registry
  metadata, and Nutanix Image Builder planning fields.
- Readiness checks for proxy no-proxy coverage, air-gapped registry TLS/CA
  handling, and Image Builder input completeness.
- Validation Evidence page and APIs for timestamped NKP readiness evidence,
  generated YAML snapshots, schema validation, optional CLI compatibility
  output, approval/job/task references, and downloadable ZIP bundles.
- Dashboard validation evidence signals showing total records, latest status,
  latest run, and records needing review.
- Admin-only PostgreSQL backup restore flow with typed confirmation, automatic
  pre-restore safety backup, audit logging, and restart guidance.
- Restore maintenance lock that rejects new workflow/NKP job submissions,
  prevents queued jobs from starting during restore, and refuses restore while
  jobs are already running or cancelling.
- ZeroTouch Framework major-version detection. ZTF 2.x checkouts are now
  reported as incompatible for the current legacy workflow/script launcher.

### Fixed
- Avoided release asset collisions in tag-triggered multi-profile AHV appliance
  builds by publishing profile-specific checksum files and attaching release
  assets from one post-matrix job.
- Made the AHV release publisher checkout the repository and pass an explicit
  GitHub repository to `gh release` commands.
- Replaced the custom AHV release upload shell with `softprops/action-gh-release`
  so tag builds publish downloaded QCOW2 artifacts through a maintained release
  uploader.
- Kept large QCOW2 images as GitHub Actions artifacts and published only
  checksum/manifest metadata to GitHub Releases to avoid the 2 GiB per-file
  Release asset limit.
- Added small per-profile release metadata artifacts so the release publisher
  does not need to download multi-gigabyte QCOW2 images.

### Changed
- The AHV appliance workflow now uses key-based Packer SSH, installs the QEMU
  ISO tooling required by cloud-init media generation, captures failure
  diagnostics, waits for cloud-init/apt locks, and names artifacts by appliance
  profile.
- Default ZeroTouch Framework install, Docker build, and container publishing
  paths now pin ZTF `v1.5.2` because upstream ZTF v2.0.0 replaces the legacy
  `main.py --workflow/--script` CLI with a new `ztf plan/apply` model.
- NKP CLI compatibility checks are restricted to admin/operator roles, and
  validation evidence recomputes readiness/schema/compatibility server-side
  instead of trusting client-supplied attestations.

### Documentation
- Documented the v1.3.0 AHV appliance profiles and clarified that v1.2.x remains
  the prior single-appliance workflow line.
- Refreshed NKP v2.17 alignment notes after local validation with real NKP
  v2.17.1 bundles staged under `C:\Share`.
- Refreshed the repository security assessment notes to cover PostgreSQL
  restore, NKP safe-phase execution, and current release-validation scope.
- Documented the ZeroTouch Framework v2.0.0 compatibility boundary and the
  current requirement to use ZTF 1.x for legacy workflows.

---

## [1.2.9] - 2026-06-13

### Added
- Initial safe-phase NKP Framework integration for
  `VirtuArchitect/nkp-zerotouch-framework`, including settings, status,
  install/update, and Jobs / Queue submission for non-apply phases.
- NKP Deployment Profile Builder with Prism Central, NKP binary, cluster,
  network, DNS/NTP, credential reference, and node inventory fields.
- NKP profile validation and YAML generation into the existing Config Files
  workflow for safe-phase execution.
- Operational visibility summary API and Dashboard deployment-readiness panel
  covering ZTF/NKP readiness, NKP profiles, generated configs, queue pressure,
  governance attention, schedules, storage backend, and backup posture.
- NKP deployment readiness validation with profile scoring, pass/warning/fail
  checks, subnet and duplicate-IP validation, VLAN range checks, generated YAML
  parsing, and pre-queue YAML validation for NKP safe-phase jobs.
- Approval-gated NKP execution for controlled phases (`prepare`, `generate`,
  `registry`, and `deploy`), including request metadata, linked job IDs, and
  self-approval prevention.
- Nutanix task UUID extraction from observable ZTF/NKP output, surfaced in Jobs
  / Queue job details when the underlying framework prints task IDs.
- NKP Binary Manager for registering staged NKP binary paths, uploading smaller
  binary bundles, tracking version/source/checksum/default status, and applying
  managed binary paths to deployment profiles.
- Appliance distribution kit for Linux VM/AHV deployments, including an
  appliance Compose file, first-boot scripts, systemd units, cloud-init
  examples, and a reference Packer QCOW2 template.
- GitHub workflow to publish the ZTF-Orchestrator container image to GitHub
  Container Registry.
- GitHub workflow to package appliance kit artifacts for release/tag/manual
  runs.
- Dashboard and health readiness signals for registered NKP binaries, including
  available/default binary counts alongside ZTF and NKP framework status.

### Changed
- Docker build context now excludes appliance build assets.
- Version references, package metadata, appliance examples, and validation
  documentation now reflect v1.2.9.

---

## [1.2.8] - 2026-06-09

### Summary
Execution visibility release: workflow and script jobs now expose conservative,
phase-based estimated progress in the live execution modal and Jobs / Queue.

### Added
- Estimated job progress metadata with phase, percentage, detail, and update
  timestamp.
- Live estimated progress bar in the execution modal.
- Estimated progress display on Jobs / Queue rows and expanded job details.
- Tests for queued, cancelled, completed, and output-derived progress states.

### Changed
- Job streams now emit updated job snapshots when progress changes.
- Documentation clarifies that percentages are orchestration estimates based on
  queue state, process launch, and observable ZTF output. Real Nutanix task IDs
  remain a future enhancement if the underlying workflow output exposes them.

---

## [1.2.7] - 2026-06-02

### Summary
Enterprise reliability release: PostgreSQL is now the default Docker backend,
Dashboard health exposes the active state backend, and workflow/script
executions now run through a durable background job worker.

### Added
- Default Docker PostgreSQL service with persistent `ztf-postgres` volume.
- Standalone `docker-compose.file.yml` for file-backed local testing.
- Durable execution jobs with queued/running/success/failed/cancelled states.
- Background execution workers controlled by `ZTF_EXEC_WORKERS`.
- Job APIs for submit, list, detail, stream, and cancellation.
- Job queue health in `/health`.
- `jobs.json` migration/import and retention support.

### Changed
- `/api/execute` keeps the existing streaming behavior but now streams from the
  persisted job log instead of owning the subprocess lifecycle.
- PostgreSQL-backed deployments persist users, sessions, settings, executions,
  approvals, schedules, pipelines, drift data, jobs, and audit events.
- Dashboard System Status shows the active state backend and database location.

---

## [1.2.6] — 2026-05-31

### Summary
Feature release: Scheduled Executions, Parallel Multi-Site Execution, and
Execution Approval Gates. Also adds the LCM Update workflow, nginx TLS and
systemd deployment guides, and new data-store files for each feature.

### Added

#### Scheduled Executions
- **`scheduler.py`** — APScheduler-backed cron engine (degrades gracefully to
  threading-based polling if APScheduler is not installed). Persists schedules
  to `schedules.json`; restores all enabled jobs on restart.
- **Schedules page** — create, edit, toggle, delete, and run-now named
  schedules; 5-field cron expressions with preset shortcuts; YAML config
  content stored per schedule; last-run status badge.
- **API** — `GET/POST /api/schedules`, `GET/PUT/DELETE /api/schedules/<id>`,
  `POST /api/schedules/<id>/run-now`. Viewer role can list; admin/operator
  can create and modify; only admin can delete.
- Scheduled runs are recorded in `history.json` and fire the webhook on
  completion.

#### Parallel Multi-Site Execution
- **`parallel_exec.py`** — `ThreadPoolExecutor`-based engine. Runs the same
  workflow against up to 10 sites simultaneously; per-site output buffers and
  status tracking; overall status `success` / `partial` / `failed`.
- **Parallel Execution page** — build a run with 2–10 labelled sites (each
  with its own YAML config), submit, and watch per-site progress in real time
  (3 s poll while running). Per-site terminal output expandable inline.
- **API** — `GET /api/parallel-runs`, `POST /api/parallel-runs` (rate-limited
  5/min), `GET/DELETE /api/parallel-runs/<id>`.

#### Execution Approval Gates
- **`approvals.py`** — state machine: `pending → approved / rejected / expired`.
  `threading.Event` for blocking pipeline integration. 24-hour auto-expire via
  daemon timer. Webhook notification on request creation and decision.
- **Approvals page** — operators submit approval requests with workflow, YAML
  config, and notes; admins approve or reject with an optional decision note;
  status-filter tabs (pending / approved / rejected / expired); pending-count
  badge on sidebar item.
- **API** — `GET/POST /api/approvals`, `GET /api/approvals/<id>`,
  `POST /api/approvals/<id>/approve` (admin only),
  `POST /api/approvals/<id>/reject` (admin only),
  `DELETE /api/approvals/<id>` (admin only).

#### LCM Update Workflow
- `lcm-update` added to `ALLOWED_WORKFLOWS` (Life Cycle Manager firmware and
  software update workflow).

#### Deployment Guides
- **`docs/nginx-tls.md`** — nginx reverse proxy guide: TLS 1.2+, HSTS,
  SSE-safe proxy settings, rate limiting, UFW firewall rules, BSI
  IT-Grundschutz alignment table.
- **`docs/systemd.md`** — systemd unit file with `NoNewPrivileges`,
  `PrivateTmp`, `ProtectSystem=strict`, `CapabilityBoundingSet=`, resource
  limits (`MemoryMax=512M`, `CPUQuota=80%`), journald logging, update
  procedure, BSI IT-Grundschutz alignment table.

### Changed
- `requirements.txt` — added `apscheduler==3.10.4`
- `server.py` — added `SCHEDULES_FILE`, `PARALLEL_FILE`, `APPROVALS_FILE`
  constants; engines initialised at startup via `_init_engines()`; atexit
  shutdown hook for scheduler
- `src/components/Sidebar.tsx` — added Schedules (Clock), Parallel Exec
  (Layers), and Approvals (ShieldCheck) nav items; version bumped to v1.2.6
- `src/types.ts` — added `Schedule`, `ParallelRun`, `ParallelSiteResult`,
  `ParallelSiteInput`, `ApprovalRequest`, `ApprovalStatus` interfaces

## [Unreleased]

### Added
- Drift Detection page and API for comparing saved desired configuration against
  the last successful applied config or a pasted current-state snapshot.
- Drift results are persisted in `drift.json` with matched, changed, missing,
  unexpected, and unknown baseline states.

---

## [1.2.5]  2026-05-31

### Summary
Patch release for Setup page session state and release metadata.

### Fixed
- Setup prerequisite check results now persist while navigating during the same app session.
- Successful prerequisite checks keep Step 1 marked complete when returning to Setup & Install.

---

## [1.2.4]  2026-05-21

### Summary
Feature release: Multi-script composition and Audit Log UI. Closes both
remaining explicit gaps from the architecture document.

### Added

#### Multi-Script Composition
- **Script queue** — clicking a script now toggles it in an ordered queue;
  numbered badges show queue position directly in the list
- **Reordering** — up/down arrows within the queue panel
- **Execution** — Run passes the full queue to ZTF as
  `--script A,B,C` in a single invocation; ZTF executes scripts sequentially
- **Backend** — `script` parameter now accepts a JSON array or a
  comma-separated string; every ID is validated against the allowlist
  before execution

#### Audit Log UI
- **`GET /api/audit-log`** — reads `ztf-orchestrator.log`, parses
  structured JSON lines, returns last N entries (default 200, max 1000);
  supports `?level=`, `?user=`, `?action=` query filters; admin-only
- **Audit Log page** — newest-first list with timestamp, level badge,
  message, user, IP, and status; expandable rows show all additional
  structured fields; free-text search and level filter buttons
  (ALL / INFO / WARNING / ERROR)
- Sidebar nav item (ScrollText icon) between Pipelines and Users

### Tests
- 6 new tests: multi-script array and comma-string acceptance, unknown
  script rejection, audit log RBAC (viewer and operator get 403)
- Coverage maintained at 74% (78 tests total)

---

## [1.2.3]  2026-05-21

### Summary
Feature release: Pipeline Builder. Operators can now chain workflows
sequentially with automatic pass/fail gates, enabling fully unattended
end-to-end Nutanix site deployments.

### Added

#### Pipeline Builder
- **Pipelines page** — create, edit, delete, and run named pipelines
  from the sidebar. Each pipeline is an ordered list of workflow + config
  file pairs stored in `~/.ztf-ui/pipelines.json`.
- **Builder UI** — per-step workflow selector (all 13 workflows) and
  config file picker, with up/down reordering and add/remove controls.
- **Sequential execution engine** — `POST /api/pipelines/<id>/run`
  chains ZTF subprocess invocations inside a single SSE stream. Each
  step only starts if the previous step exited with return code 0. On
  first failure, remaining steps are marked skipped and the stream closes.
- **Step progress rail** — the execution modal shows all steps with live
  status: pending → running (spinner) → success / failed / skipped.
  Terminal output is combined with step-separator headers between steps.
- **History integration** — pipeline runs recorded with `type: pipeline`,
  full `steps[]` result array, and webhook notification on completion.
- **RBAC** — admin and operator can create/edit/delete/run; viewer can
  list only.

#### API
- `GET/POST /api/pipelines` — list and create
- `GET/PUT/DELETE /api/pipelines/<id>` — read, update, delete
- `POST /api/pipelines/<id>/run` — SSE execution stream

### Changed
- Sidebar: Pipelines nav item (GitBranch icon) between Executions and Users
- Coverage: 72% → 74% (13 new tests in `tests/test_pipelines.py`)

---

## [1.2.2]  2026-05-21

### Summary
Feature and polish release. Adds execution re-run directly from history,
fixes the favicon, and corrects the sidebar version string.

### Added
- **Execution re-run** expand any row in Execution History to see a
  **Re-run** button alongside the config filename. Clicking fires the
  workflow or script immediately using the original stored YAML no
  form re-entry required. The config is saved with each execution record
  going forward; older records without stored config do not show the button.
  History reloads automatically when the re-run modal closes.

### Fixed
- **Favicon not displaying** `favicon.png` was placed in `static/` (not
  served at `/`) and `index.html` still referenced `/favicon.svg`. Moved to
  `public/` so Vite copies it into `dist/` on build; updated the `<link>`
  to `type="image/png" href="/favicon.png"`.
- **Sidebar version string** the bottom-left sidebar showed `ZTF UI v1.0.0`
  regardless of the installed version. Updated to `v1.2.2` and aligned with
  the other version strings in `server.py`, `package.json`, and `Settings.tsx`.
- **`backup_config` Windows compatibility** — `Path.rename()` raises
  `FileExistsError` on Windows when the `.bak.1` target already exists.
  Replaced with `Path.replace()`, which is atomic and overwrites on all
  platforms.

### Changed
- Execution history records now include `configContent` and `configFile`
  fields to support re-run. Existing records without these fields are
  unaffected.

---

## [1.2.1]  2026-05-21

### Summary
Bug-fix and security patch release. Resolves three functional regressions
in the 1.2.0 UI, patches seven CVEs in Python dependencies, fixes the
CI pipeline, and adds webhook notifications.

### Fixed

#### UI
- **Global Config round-trip** — opening the Global Config page no longer
  resets all fields to defaults. The fetched `global.yml` is now parsed back
  into form state: vault type, IP allocation method, credentials, CyberArk
  settings, and Infoblox settings all populate correctly on load.
- **Config backup restore unreachable** — the server-side `.bak.N` backup
  files created on every config overwrite were previously inaccessible from
  the UI. A **History** button now appears when backups exist; clicking it
  shows all versions with timestamps and sizes, each with a **Restore**
  action (the current file is backed up before restoring).
- **Dashboard no auto-refresh** — the dashboard fetched system checks and
  execution history once on mount and never updated. It now polls every
  30 seconds and includes a manual **Refresh** button with a spinner.

#### CI / Build
- `npm ci` was failing with a peer dependency conflict: `@vitejs/plugin-react@4.x`
  declares `vite@"^4–7"` as its peer but the lockfile had `vite@8`. Upgraded
  to `@vitejs/plugin-react@^6.0.2` which targets `vite@^8`.
- `tests/conftest.py` — `admin_token` fixture referenced `isolated_data_dir`
  without declaring it as a parameter, causing pytest to inject the raw fixture
  function instead of the resolved `Path`. Fixed parameter declaration; added
  `server._ensure_default_admin()` call after module reload so `users.json`
  exists before any test reads it.
- Four POST path-traversal test assertions updated to accept HTTP 405 alongside
  400/404 — Werkzeug normalises `../../etc/passwd` URLs before routing, landing
  on the GET-only SPA fallback.
- Added 11 targeted tests (backup list/restore, executions, global config,
  user role update) to restore coverage above the 70% CI gate.

### Added
- **Webhook notifications** — set a URL in **Settings → Notifications** to
  receive a `POST` on every workflow or script completion. Payload includes
  `workflow`, `status`, `returnCode`, `user`, `timestamp`, and `executionId`.
  Fired in a daemon thread using stdlib `urllib` (no new dependency); failures
  are logged and never interrupt an execution.
- **Favicon** — `static/favicon.png`: dark-navy background with a faceted
  teal prism and automation arc.

### Security
- `flask` upgraded `3.0.3 → 3.1.3` — resolves **CVE-2026-27205**.
- `flask-cors` upgraded `4.0.1 → 6.0.2` — resolves **CVE-2024-6844**,
  **CVE-2024-6866**, **CVE-2024-6839**, **PYSEC-2024-71**, **PYSEC-2024-260**.
  `PYSEC-2024-271` (CRLF log injection in debug mode, no fix available in any
  release) suppressed in `pip-audit` with documented justification; app binds
  to localhost only and debug logging is off by default.

### Changed
- `.gitignore` expanded to exclude `__pycache__/`, `*.pyc`, `.coverage`,
  `.pytest_cache/` — generated artefacts are no longer committable.
- `dist/` rebuilt against `@vitejs/plugin-react@6` and new frontend changes.

---

## [1.2.0] 2026-05-20

### Summary
Production hardening release. Replaces the shared API key with a full
username/password authentication system, adds role-based access control,
structured logging, rate limiting, execution timeout, concurrency locking,
config file versioning, a Docker deployment model, a CI pipeline, and a
pytest test suite.

### Added

#### Authentication & Authorisation
- User authentication: bcrypt-hashed passwords stored in `users.json`
- Session tokens (64-char hex, 8-hour TTL) returned on `POST /api/auth/login`
- `POST /api/auth/logout` invalidates the current session token
- `GET /api/auth/me` returns current user info
- Three roles: `admin`, `operator`, `viewer` enforced on every endpoint
- Role matrix:
  - **admin** — full access including settings, global config, and user management
  - **operator** — execute workflows, manage config files, read executions
  - **viewer** — read-only access to configs, executions, and system check
- User management endpoints (`GET/POST /api/users`, `PUT/DELETE /api/users/:username`) — admin only
- First-run default admin account created automatically; credentials printed to console

#### Reliability
- Execution timeout: configurable via `ZTF_EXEC_TIMEOUT` (default 3600s); hung ZTF processes are killed automatically
- Concurrency lock: one execution per workflow at a time; HTTP 409 returned if already running
- Config file backup: last 5 versions retained before any overwrite (`config.yml.bak.1` … `.bak.5`)
- Subprocess killed on client disconnect (`GeneratorExit` handling in SSE generator)

#### Observability
- Structured JSON logging to stderr and `$ZTF_DATA_DIR/ztf-orchestrator.log`
- Every request logged with method, path, user, and remote IP
- Execution events logged: start, complete, timeout, cancel, error
- `/health` endpoint (public, no auth) — returns `status`, `ztf_installed`, `version`; used by Docker `HEALTHCHECK` and load balancers

#### Security
- Rate limiting via Flask-Limiter: 10/min on `/api/auth/login` (brute force protection), 10/min on `/api/execute`, 2/min on `/api/install`
- `Content-Security-Policy` header added to all responses
- `Permissions-Policy` header added (`geolocation`, `microphone`, `camera` denied)
- `Referrer-Policy: strict-origin-when-cross-origin` added
- Execution history expanded to 1000 records; records now include username

#### Configuration
- All paths, ports, timeouts, and TTLs configurable via environment variables
- No hardcoded `~` home directory paths — use `ZTF_DATA_DIR` instead
- `.env.example` documents every supported environment variable

#### Deployment
- `Dockerfile` — non-root `ztf-svc` service account, `HEALTHCHECK`, all config via env
- `docker-compose.yml` — persistent named volumes, localhost-only port binding, log rotation
- `start.sh` superseded by Docker and systemd (see README)

#### Testing
- `tests/conftest.py` — isolated temp directory fixtures; no tests touch `~/.ztf-ui`
- `tests/test_auth.py` — login/logout/token lifecycle, public health endpoint
- `tests/test_validation.py` — allowlist injection, path traversal (8 variants), YAML bombs, body size, settings key filtering
- `tests/test_api.py` — RBAC enforcement per role, config CRUD, backup verification, user management, security headers

#### CI Pipeline
- `.github/workflows/ci.yml`:
  - `pip-audit` vulnerability scan against `requirements.txt`
  - `pytest` with coverage report (`--cov-fail-under=70`)
  - `npm audit --audit-level=high`
  - `tsc --noEmit` TypeScript check
  - `npm run build` frontend build verification
  - Docker image build + `/health` smoke test (on `main` only)

### Changed
- `requirements.txt` — pinned to exact versions; added `bcrypt==4.2.1` and `flask-limiter==3.8.0`
- `package.json` — bumped to `1.2.0`; removed `concurrently`, `express`, `cors` dev dependencies
- `src/store.ts` — replaced `apiKey` field with `sessionToken` + `user` object (persisted to localStorage)
- `src/utils/api.ts` — `apiFetch()` now sends `Authorization: Bearer <token>` instead of `X-API-Key`
- `src/components/Header.tsx` — shows logged-in username, role badge, and logout button
- `src/pages/Settings.tsx` — removed API key field; settings are read-only for non-admin roles
- `src/App.tsx` — added `RequireAuth` guard; unauthenticated users redirected to `/login`
- Execution history limit increased from 100 to 1000 records
- `ZTF_DATA_DIR` now used for all file I/O (was hardcoded `~/.ztf-ui`)

### Removed
- `server.js` — duplicate Express.js backend deleted; Flask (`server.py`) is the single canonical backend
- Shared API key authentication — replaced by per-user session tokens
- `apiKey` field from `Settings` type and Zustand store

---

## [1.1.0] 2026-05-20

### Summary
Security remediation release. Addressed all critical and high severity
vulnerabilities identified in the initial validation review.

### Fixed

#### Critical
- **Command injection** — all subprocess calls converted from `shell=True` + string
  concatenation to argument lists. `workflow` and `script` values validated against
  hardcoded allowlists (`ALLOWED_WORKFLOWS`, `ALLOWED_SCRIPTS`) before any subprocess
  call. Applies to both `server.py` and `server.js`.
- **Path traversal** — config file names resolved and checked to remain within the
  configured `configs` directory using `Path.resolve()` + `relative_to()` before any
  read, write, or delete operation.

#### High
- **Missing authentication** — all API endpoints protected by `X-API-Key` header
  validation using `secrets.compare_digest()` (Python) / `crypto.timingSafeEqual()`
  (Node.js). Key auto-generated as 64-char hex on first start, stored at
  `$ZTF_DATA_DIR/.api_key` (0600 permissions).
- **Unrestricted CORS** — replaced `CORS(app)` / `cors()` (wildcard) with explicit
  localhost-only origin lists.

#### Medium
- **Exception leakage** — full exception stack traces no longer sent to browser via
  SSE. Full detail logged server-side; generic message sent to client.
- **Insecure file permissions** — `~/.ztf-ui/` created with 0700; all files within
  created with 0600 on every write.
- **Sensitive execution history** — full command strings and config file paths removed
  from `history.json`.
- **YAML injection** — `yaml.safe_load()` validation applied to all user-submitted
  YAML content before acceptance.
- **Arbitrary repo clone** — `ALLOWED_REPOS` set enforces only the official ZTF
  GitHub URL during install.

#### Low
- **Request body size** — 1 MB cap enforced via `before_request` hook (Flask) and
  `express.json({ limit: '1mb' })` (Node.js).
- **Security headers** — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Cache-Control: no-store` added to all responses.
- **Server bind address** — Flask bound to `127.0.0.1` only (was `0.0.0.0`).

### Added
- `src/utils/api.ts` — `apiFetch()` wrapper injects `X-API-Key` on every request
- `apiKey` field in `Settings` type and Zustand store (stored in localStorage only,
  never sent to server as part of the settings payload)
- API Key field in Settings page with show/hide toggle
- `select` module replaced with two thread readers + `queue.Queue` for
  cross-platform subprocess output streaming (Windows compatibility)

### Changed
- `server.py` — `shell=True` removed from all subprocess calls
- `server.js` — `spawn('bash', ['-c', cmd])` replaced with `spawn(args[0], args.slice(1))`
- All frontend `fetch()` calls replaced with `apiFetch()`
- `README.md` — added Security Model section, deployment boundaries table,
  updated first-time setup instructions

---

## [1.0.0] 2026-05-16

### Summary
Initial release. Web-based graphical interface for the
[Nutanix ZeroTouch Framework](https://github.com/nutanixdev/zerotouch-framework),
replacing GitHub Actions and CLI-based configuration management with a visual
operator interface.

### Added
- React 18 + TypeScript frontend (Vite, Tailwind CSS, Zustand)
- Flask 3.0 backend (`server.py`) and Express.js backend (`server.js`)
- 13 workflow forms: Cluster Create, Imaging Only, Pod Imaging, Site Deploy,
  Configure Cluster, Deploy/Configure Prism Central, Pod Config,
  Deploy/Configure Management PC, Calm VM Workloads, Edge AI Workload, NDB Deploy
- Script library: 61 ZTF scripts across 12 categories, searchable and executable
- Live YAML preview with download for all workflow configurations
- Real-time execution output via Server-Sent Events (SSE)
- Execution history with status filtering
- Global Config page: vault (Local/CyberArk) and IPAM (Static/Infoblox) configuration
- Config Files page: browse, create, edit, delete YAML/JSON configs
- Setup page: prerequisites check and one-click ZTF installation
- Dashboard: system health, recent executions, quick-action buttons
- Settings page: ZTF path, Python executable, config directory

---

[1.2.5]: https://github.com/VirtuArchitect/ZTF-Orchestrator/compare/v1.2.4...v1.2.5
[1.2.4]: https://github.com/VirtuArchitect/ZTF-Orchestrator/compare/v1.2.3...v1.2.4
[1.2.3]: https://github.com/VirtuArchitect/ZTF-Orchestrator/compare/v1.2.2...v1.2.3
[1.2.2]: https://github.com/VirtuArchitect/ZTF-Orchestrator/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/VirtuArchitect/ZTF-Orchestrator/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/VirtuArchitect/ZTF-Orchestrator/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/VirtuArchitect/ZTF-Orchestrator/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/tag/v1.0.0
