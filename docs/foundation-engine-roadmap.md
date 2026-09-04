# Native Foundation Engine Roadmap

Current release marker: `v1.8.1`.

This roadmap phases native Foundation capability into ZTF-Orchestrator while
keeping documentation, validation evidence, and support boundaries current.

## Phase 0 - Architecture Boundary

Status: implemented foundation.

- Define the native Foundation engine architecture.
- Expose `GET /api/native-foundation/phases` as the read-only phase catalog so
  operators and tests can track implementation state from one API contract.
- Add `POST /api/native-foundation/phases/advancement-review` so phase
  promotion checks bind to the current intent and remain blocked until
  controlled UAT and explicit adapter enablement are complete.
- State that execution adapters are disabled until controlled UAT validates
  them.
- Keep Nutanix Foundation binaries and proprietary artifacts out of the public
  repository.
- Update README, validation status, architecture index, and limitations.

## Phase 1 - Intent Model

Status: implemented foundation.

- Add the `native-foundation-deploy` workflow catalog entry.
- Add a planning-only native Foundation YAML shape.
- Validate sites, hardware providers, clusters, deployment types, nodes, and
  role consistency.
- Disable mutating execution for the workflow.

## Phase 2 - Read-Only Discovery

Status: implemented foundation.

- Add a read-only discovery preview endpoint for native Foundation intents.
- Normalize `manual_static` site, cluster, deployment type, role, and node facts
  from operator-supplied YAML.
- Mark Redfish, NX, and Intersight providers as adapter-planned without
  contacting external systems.
- Add live discovery contract manifest for provider-specific adapter input,
  normalized output, and UAT evidence requirements.
- Add read-only discovery reconciliation for comparing supplied adapter-style
  facts against the intended node plan.
- Preserve the no-mutation boundary: no power state, boot order, imaging, or
  cluster formation actions are enabled.

## Phase 3 - Plan And Approval Binding

Status: implemented foundation.

- Compute deterministic plan ID, intent hash, and discovery hash.
- Return copy-ready approval metadata with plan ID, site scope, and cluster
  scope.
- Add read-only approval binding review for approved requests and captured
  native Foundation Validation Evidence records.
- Keep the plan read-only; future execution adapters must require matching
  approved metadata before any mutating action.
- Defer live topology, image, network, and hardware support findings until
  provider adapters produce validated facts.

## Phase 4 - Imaging-Only UAT

Status: implemented readiness gate.

- Add execution readiness API for `imaging_only` and future native Foundation
  phases.
- Report required gates for plan validity, adapter enablement, provider UAT,
  image source verification, network path verification, and recovery review.
- Add read-only AOS and hypervisor image source manifest with checksum and
  version readiness checks.
- Add read-only node imaging plan with per-node Foundation payload previews
  bound to image, network, secret-reference, and discovery-reconciliation
  metadata.
- Add read-only network/IPAM manifest for VIP, BMC, host, CVM, gateway, DNS,
  NTP, duplicate IP, and subnet membership review.
- Add read-only secret reference manifest for provider and BMC credential
  reference names, with inline secret-like fields blocked by path only.
- Keep mutating imaging execution blocked until controlled UAT accepts the
  evidence.
- Future work: enable the first mutating adapter only for a controlled UAT
  hardware family, one site, and a bounded node set.

## Phase 5 - HCI Cluster Create UAT

Status: implemented planning graph; mutating UAT planned.

- Add read-only HCI cluster-create graph actions after imaging-only planning.
- Add read-only cluster formation plan with topology payload previews for HCI,
  compute-only, storage-only, and mixed clusters.
- Add read-only post-create validation plan with Prism Element and topology
  verification payload previews.
- Future work: enable HCI cluster-create execution only after imaging-only
  evidence is accepted and adapter UAT proves the mutating path.
- Optionally trigger the post-foundation baseline workflow after approval.

## Phase 6 - Multi-Site And Multi-Cluster

Status: implemented planning graph and per-cluster evidence packs; mutating UAT planned.

- Add site-level read-only concurrency waves.
- Support sequential or parallel site planning and per-cluster wave ordering.
- Add provider adapter manifest scaffold for discovery, power, boot, image
  mount, and imaging operations.
- Add provider preflight manifest that composes provider, secret-reference,
  image, and network metadata before any live discovery UAT.
- Add per-cluster evidence packs that bind plan, graph, readiness, and adapter
  contracts.
- Add read-only provider/topology matrix review that evaluates every
  site/cluster provider, deployment type, planned phase, and evidence
  requirement without contacting hardware.
- Add read-only provider operation catalog that expands each site/cluster matrix
  row into disabled provider and deployment operations for discovery, power,
  boot, image mount, imaging, HCI create, compute registration, storage
  formation, and validation.
- Add read-only provider operation admission review that converts operation
  catalog rows into blocked per-operation admission records with approval and
  evidence binding status before any future UAT runner can persist or run them.
- Add read-only provider operation queue planning that turns admission records
  into deterministic blocked queue items with dependency and execution-graph
  provenance while preserving zero queued, persisted, or runnable operations.
- Add read-only provider operation queue admission review that turns queue
  items into blocked admission records with approval/evidence binding status
  while preserving zero admitted, persisted, queued, or runnable operations.
- Add read-only evidence pack approval review that binds each pack to Approval
  Gates, Validation Evidence, accepted UAT evidence, and per-cluster go/no-go
  records without persisting decisions or enabling execution.
- Add adapter readiness reporting that maps cluster-scoped provider/topology
  targets to missing UAT evidence.
- Add deployment policy review for site windows, maximum parallel sites,
  maximum parallel clusters per site, approval binding, evidence requirements,
  and failure behavior.
- Add read-only deployment wave rehearsal packages that bind per-site gates,
  per-cluster evidence packs, recovery actions, runner blockers, operator
  go/no-go controls, and blast-radius metadata without opening waves.
- Add read-only deployment wave authorization review that composes wave
  rehearsal, evidence pack approval, permit review, lock plan, runner blockers,
  recovery context, and blast-radius metadata without persisting authorization.
- Add read-only deployment window reservation review that binds wave
  authorization, declared site windows, and site/cluster lock requests without
  persisting reservations or opening waves.
- Add read-only deployment scheduler review that binds reservation records,
  execution requests, dry-run ledger entries, permits, locks, recovery actions,
  and job-state plans into disabled schedule items without opening waves or
  enqueuing jobs.
- Add read-only recovery plan review for stop, retry, rollback, checkpoint, and
  evidence actions.
- Future work: connect per-site gates, parallel deployment windows, evidence
  pack approval, stop, retry, rollback, and blast-radius behavior to validated
  adapters.

## Phase 7 - Compute-Only And Storage-Only

Status: implemented planning graph; support validation planned.

- Add deployment-type-specific graph actions for compute-only, storage-only,
  mixed HCI/compute, and mixed storage/compute topologies.
- Add deployment-type-specific read-only post-create validation check previews.
- Add read-only deployment type support review that binds topology graph steps,
  cluster formation previews, post-create validation previews, adapter
  readiness, promotion review, and controlled-UAT checklist cases into
  fail-closed support records.
- Future work: validate these topology rules against current Nutanix version and
  hardware support evidence.
- Future work: back deployment-type-specific post-create checks with controlled
  UAT and live Prism Element evidence.

## Phase 8 - Production Hardening

Status: implemented read-only adapter contract registry, resume checkpoint, and
job-state model; remaining hardening planned.

- Add read-only resume checkpoint manifests for native Foundation jobs.
- Add read-only native Foundation job state plans for queue, running,
  checkpoint, pause, failure, recovery, and completion transitions.
- Add read-only restart/resume review that composes checkpoints, job-state
  transitions, retained artifacts, audit, locks, and scheduler metadata into
  disabled replay records.
- Add read-only backup/restore review that composes retention targets, restore
  rehearsal checks, checkpoints, job state, audit, and restart/resume records
  into disabled disaster-recovery readiness records.
- Add read-only mutating enablement review that composes runner readiness,
  backup/restore, UAT evidence acceptance, controlled UAT signoff, controlled
  UAT execution authorization, carried authorization-persistence provenance,
  runtime admission, preflight, connectivity, credential, command, output
  evidence, and retained export reviews into a disabled final execution-enable
  gate.
- Add read-only execution submission review that builds future per-wave job
  submission envelopes from mutating enablement, carried
  authorization-persistence enablement gate status, request, controlled UAT
  completion and auth-persistence completion-gate summaries, scheduler, runner
  readiness, and controlled UAT entry reviews without enqueueing jobs.
- Add read-only queue persistence review that declares future per-wave durable
  queue records, carried authorization-persistence enablement gate status,
  controlled UAT completion gate summaries, checkpoint persistence, audit
  persistence, retention persistence, and replay registration requirements
  without writing records.
- Add read-only queue persistence admission review that declares disabled
  admission records from queue persistence review and carried
  authorization-persistence enablement gate status plus controlled UAT
  completion gate summaries without persisting queue state, registering replay,
  enqueueing jobs, or persisting job state.
- Add read-only mutating adapter binding review that ties queue persistence
  admission, job persistence admission, carried authorization-persistence
  enablement gate status, controlled UAT completion gate summaries,
  authorization persistence admission provenance, carried
  authorization-persistence provenance, activation, allow-listing, runtime
  admission, preflight, connectivity, credential handoff, plan hash, approval
  metadata, and UAT evidence metadata to future adapter binding records without
  persisting job state, persisting authorization, persisting bindings, or
  loading adapters.
- Add read-only controlled UAT lane selection review that declares bounded
  provider, deployment-type, site, provider operation queue admission,
  queue-admission, authorization-persistence, carried authorization-persistence
  enablement gate status, controlled UAT completion gate summaries, carried
  authorization-persistence, and adapter-binding lanes before any future UAT
  entry issuance or hardware reservation.
- Add read-only controlled UAT lane persistence admission review that binds
  selected UAT lanes, provider operation queue admission provenance,
  queue-admission provenance, authorization-persistence provenance, carried
  authorization-persistence enablement gate status, controlled UAT completion
  gate summaries, carried authorization-persistence provenance, job
  persistence admission, mutating adapter binding, and scope controls before
  any future hardware reservation admission.
- Add read-only controlled UAT hardware reservation review that binds admitted
  UAT lanes, queue-admission provenance, authorization-persistence provenance,
  carried authorization-persistence enablement gate status, controlled UAT
  completion gate summaries, and carried authorization-persistence provenance
  to deployment windows, scheduler items, lock requests, and operations
  controls without persisting reservations or opening maintenance windows.
- Add read-only controlled UAT reservation persistence admission review that
  binds reservation records, queue-admission provenance,
  authorization-persistence provenance, carried authorization-persistence
  enablement gate status, controlled UAT completion gate summaries, carried
  authorization-persistence provenance, signoff, operations, and UAT evidence
  before any future reservation persistence, maintenance-window opening, or UAT
  entry issuance.
- Bind controlled UAT entry review to the read-only hardware reservation review
  so entry issuance cannot advance without reservation/window/lock/operations
  evidence.
- Add read-only controlled UAT entry issuance review that assembles future
  entry issuance records from entry, hardware reservation, reservation
  persistence admission, queue-admission provenance,
  authorization-persistence provenance, carried authorization-persistence
  enablement gate status, controlled UAT completion gate summaries, carried
  authorization-persistence provenance, signoff, and UAT evidence acceptance
  reviews without persisting or issuing UAT entry.
- Add read-only controlled UAT entry persistence admission review that binds
  entry issuance, reservation persistence admission, queue-admission
  provenance, authorization-persistence provenance, carried
  authorization-persistence enablement gate status, controlled UAT completion
  gate summaries, carried authorization-persistence provenance, signoff,
  runbook, UAT evidence, and approval/evidence bindings before any future UAT
  entry persistence or controlled UAT start.
- Add read-only controlled UAT start readiness review that declares future
  start records from entry persistence admission, queue-admission provenance,
  authorization-persistence provenance, carried authorization-persistence
  enablement gate status, controlled UAT completion gate summaries, and
  carried authorization-persistence provenance controls without starting UAT,
  runners, adapters, or Foundation calls.
- Add read-only controlled UAT start persistence admission review that binds
  start readiness, entry persistence, queue-admission provenance,
  authorization-persistence provenance, carried authorization-persistence
  enablement gate status, controlled UAT completion gate summaries, carried
  authorization-persistence provenance, approval/evidence, and lock controls
  before any future persisted UAT start state or runner admission.
- Add read-only UAT evidence acceptance review that maps provider and
  deployment-type requirements to accepted `foundation_engine.uat_evidence`
  IDs before any future persisted UAT signoff or adapter enablement.
- Add read-only execution authorization persistence admission review that
  composes controlled UAT execution authorization, runner persistence
  admission, carried queue-admission provenance, and carried
  authorization-persistence provenance when present into disabled authorization
  persistence admission records before durable job persistence, preserving a
  disabled placeholder cycle breaker until real authorization records exist.
- Add read-only execution request persistence admission review that composes
  future execution request envelopes plus controlled UAT completion and
  auth-persistence completion-gate summaries into disabled request persistence
  admission records before execution submission.
- Add read-only execution submission persistence admission review that composes
  future execution submission envelopes and controlled UAT completion gate
  summaries into disabled submission persistence admission records before
  queue persistence.
- Add read-only job persistence admission review that composes queue
  persistence admission, carried authorization-persistence enablement gate
  status, controlled UAT completion gate summaries, execution authorization
  persistence admission, carried authorization queue-admission provenance,
  carried authorization-persistence provenance when present, job state,
  restart/resume, and backup/restore reviews into disabled durable persistence
  admission records.
- Future work: persist mutating native Foundation job state and implement
  resume-after-restart behavior only after persistence admission, adapter
  execution, and recovery pass UAT.
- Version adapter contracts and expose a read-only contract registry.
- Expose provider adapter operation scaffolds without loading mutating adapters.
- Future work: persist any mutating adapter binding only after the read-only
  binding review passes with controlled hardware UAT evidence.
- Report adapter readiness without enabling execution.
- Report deployment policy and blast-radius readiness without enabling
  scheduling.
- Add read-only adapter promotion review before controlled UAT.
- Add read-only UAT checklist generation for scoped provider/topology reviews.
- Add read-only adapter UAT rehearsal planning for provider operations,
  deployment phases, required evidence, and expected sanitized artifacts before
  controlled hardware testing.
- Add read-only adapter activation review so provider/deployment evidence,
  approval binding, rehearsal, promotion state, and controlled UAT completion
  requirement can be reviewed before a future explicit adapter enablement
  change.
- Add read-only adapter enablement registry review that drafts disabled
  provider/deployment registry entries for every reviewed site/topology scope
  with controlled UAT completion requirements without persisting status changes
  or loading adapters.
- Add read-only adapter allow-list review that converts disabled registry drafts
  into approval artifacts with controlled UAT completion requirements without
  persisting entries, loading adapters, or enabling execution.
- Add read-only adapter load plan review that converts allow-list, controlled
  UAT completion requirement, signoff, and contract artifacts into not-loaded
  adapter entries without package reads, module imports, credential handoff, or
  runner start.
- Add read-only adapter package provenance review that records package owner,
  private reference, SHA256, signature, signer metadata, and controlled UAT
  completion requirement without reading packages, hashing bytes, verifying
  signatures, staging files, or importing code.
- Add read-only adapter SBOM review that records SBOM owner, private reference,
  supported format, SHA256, vulnerability scan reference, and controlled UAT
  completion requirement without generating SBOMs, reading SBOMs, parsing
  component inventories, running vulnerability scans, staging files, or
  importing code.
- Add read-only adapter runtime isolation review that records runtime owner,
  isolation profile, sandbox image, network policy, filesystem policy
  references, and controlled UAT completion requirement without creating
  sandboxes, applying policies, registering hooks, importing code, handing off
  credentials, or starting adapter processes.
- Add read-only adapter runtime admission review that records admission owner,
  private approval reference, private change ticket, exception reference, and
  controlled UAT completion requirement without admitting runtimes, loading
  adapters, handing off credentials, submitting mutating jobs, or contacting
  deployment targets.
- Add read-only adapter execution preflight review that records preflight owner,
  evidence, adapter command, target connectivity, rollback readiness
  references, and controlled UAT completion requirement without running
  commands, resolving secrets, opening target connections, or submitting
  mutating jobs.
- Add read-only adapter target connectivity review that records connectivity
  owner, scope, target allow-list, maintenance window, probe plan references,
  and controlled UAT completion requirement without opening sockets,
  authenticating, resolving secrets, running probes, or contacting deployment
  targets.
- Add read-only adapter credential handoff review that records handoff owner,
  credential handoff, secret lease policy, adapter identity, redaction policy
  references, and controlled UAT completion requirement without opening leases,
  resolving secrets, exposing values, or handing credentials to adapters.
- Add read-only adapter command invocation review that records command owner,
  command catalog, invocation policy, execution identity, output capture
  references, and controlled UAT completion requirement without assembling
  commands, writing command files, invoking adapters, or capturing live output.
- Add read-only adapter output evidence review that records retention,
  redaction, failure classification, evidence-store references, and controlled
  UAT completion requirement without capturing output, writing artifacts,
  persisting evidence, or classifying live failures.
- Add read-only retained evidence export review that records export owner,
  private export request, retention store, RBAC review, checksum manifest,
  retention plan, output evidence references, and controlled UAT completion
  requirement without reading retained artifacts, generating ZIPs, writing
  checksums, or persisting evidence.
- Add redacted native Foundation review packet export for approval and UAT
  handoff, including carried authorization-persistence enablement gate counts
  and controlled UAT completion gate counts in the manifest and durable
  review-job output.
- Bind review packets back to Approval Gates and Validation Evidence before any
  future mutating adapter can execute.
- Add read-only execution admission review that composes readiness, adapter,
  policy, approval, evidence, controlled UAT completion, and auth-persistence
  completion-gate metadata before any future execution start.
- Add read-only execution adapter contract that defines deterministic request
  envelopes, checkpoint binding, controlled UAT completion gate metadata,
  auth-persistence completion-gate metadata, audit outputs, and evidence
  outputs without loading adapters.
- Add read-only execution request review that builds future job submission
  metadata with controlled UAT completion and auth-persistence completion-gate
  summaries without enqueuing work.
- Add read-only dry-run execution ledger review that records site/cluster graph
  steps, adapter request IDs, checkpoint state, and expected evidence outputs
  without running adapters.
- Add read-only execution permit review that binds approval, Validation
  Evidence, admission, request, dry-run ledger, recovery, job state, and
  disabled registry draft state without issuing a permit.
- Add read-only execution lock plan review that declares orchestration, site,
  cluster, and adapter lock requests without acquiring locks or reserving
  deployment windows.
- Add read-only execution audit plan review that declares audit events and
  retained evidence artifacts without appending audit records or exporting
  evidence.
- Add read-only execution retention plan review that declares retention
  policies, backup targets, and restore rehearsal checks without persisting
  artifacts or running backup/restore.
- Add read-only runner readiness review that composes final permit, lock, audit,
  retention, secret, registry, activation, and controlled-UAT blockers without
  starting a runner.
- Add read-only controlled UAT runner admission review that composes start
  persistence admission, queue-admission provenance,
  authorization-persistence provenance, carried authorization-persistence
  enablement gate status, controlled UAT completion gate summaries, carried
  authorization-persistence provenance, runtime admission, runtime isolation,
  and runner readiness into disabled runner-admission records without admitting
  runtimes or starting runners.
- Add read-only controlled UAT runner persistence admission review that binds
  runner admission, start persistence, queue-admission provenance,
  authorization-persistence provenance, carried authorization-persistence
  enablement gate status, controlled UAT completion gate summaries, carried
  authorization-persistence provenance, runtime admission, runner readiness,
  and approval/evidence gates before any future runner admission persistence.
- Add read-only controlled UAT execution authorization review that composes
  runner persistence admission, queue-admission provenance, carried
  authorization-persistence enablement gate status, controlled UAT completion
  gate summaries, carried authorization-persistence provenance, preflight,
  target connectivity, credential handoff, command invocation, and output
  evidence into disabled authorization records without invoking adapters or
  submitting jobs.
- Add read-only controlled UAT completion review that composes execution
  authorization, controlled UAT completion gate summaries, output evidence,
  retained evidence export, signoff, and evidence acceptance into disabled
  completion records without marking UAT complete, promoting adapters,
  certifying production support, or submitting jobs.
- Add read-only execution authorization persistence admission review that binds
  controlled UAT authorization, runner persistence, carried queue-admission
  provenance, carried authorization-persistence enablement gate status,
  controlled UAT completion gate summaries, carried authorization-persistence
  provenance when present, approval/evidence, and output-evidence controls
  before any future authorization persistence or job persistence admission.
- Add read-only job state planning that binds future execution requests,
  checkpoints, adapter requests, recovery plans, and retention artifacts without
  writing durable state.
- Add durable native Foundation review jobs that rehearse artifact generation,
  including request persistence admission, through Jobs / Queue without
  provider, Foundation, Prism Element, secret, or hardware mutation.
- Add read-only secret resolution plan that inventories future secret-store
  requests without reading or exposing secret values.
- Add read-only secret-store binding review that declares lease, audit, RBAC,
  and adapter-handoff records without resolving or exposing secret values.
- Add read-only secret-store provider contract review that checks provider
  metadata, supported auth modes, private provider reference, lease boundary,
  audit requirement, RBAC roles, and redaction requirement without opening
  leases or resolving values.
- Add read-only secret lease execution review that records lease owner, policy,
  audit sink, adapter identity, revocation, provider contract, and binding
  references without authenticating to a secret store, opening leases, resolving
  values, persisting audit events, or handing credentials to adapters.
- Add read-only secret audit persistence review that records audit owner,
  policy, sink, retention, failure-classification, lease execution, provider
  contract, and binding references without appending audit events, writing
  retained artifacts, reading retained secret material, classifying live
  failures, or submitting jobs.
- Add read-only controlled UAT entry review that composes runner, activation,
  registry, UAT rehearsal, signoff requirement, secret binding, audit, and
  retention blockers before a future bounded hardware-UAT lane can be
  explicitly enabled.
- Add read-only controlled UAT scope review that declares bounded site, cluster,
  node, provider, topology, evidence, artifact, and policy scope before any
  future hardware-UAT authorization.
- Add read-only controlled UAT runbook review that checks UAT window, rollback
  owner, evidence-retention target, and operator steps without approving UAT.
- Add read-only controlled UAT security review that checks security reviewer
  metadata, secret boundary, audit/retention boundary, disabled adapter
  registry state, and private review reference without approving UAT.
- Add read-only controlled UAT operations review that checks operations owner
  metadata, private maintenance/change ticket, private backup/restore evidence,
  recovery posture, retention posture, and future lock scope without approving
  UAT.
- Add read-only controlled UAT signoff review that composes scope, runbook,
  security, operations, allow-list, secret-store provider contract, and secret
  audit persistence reviews with private signoff metadata without persisting
  signoff or issuing UAT entry.
- Future work: add a mutating secret-store integration that resolves named
  credential references only inside approved, audited, UAT-validated adapter
  execution.
- Future work: extend CI, security, backup, and disaster recovery documentation
  once a mutating adapter enters controlled UAT.

## Merge Rule

No native Foundation phase should merge without updating documentation in the
same pull request. If the code change alters operator behavior, update the user
guide and validation status. If it alters execution or security posture, update
the relevant runbook, support matrix, UAT checklist, and security notes.
