# Native Foundation Support Matrix

Current release marker: `v1.8.0`.

This matrix separates implemented planning behavior from future deployment
execution.

| Capability | Status | Notes |
|---|---|---|
| Phase catalog API | Implemented foundation | `GET /api/native-foundation/phases` exposes the nine-phase rollout state, supported readiness phases, current planning-only execution mode, and zero mutating-enabled phases. |
| Phase advancement review | Implemented foundation | `POST /api/native-foundation/phases/advancement-review` binds a requested phase to the current intent, evaluates required phase evidence references, and reports promotion blockers without changing phase status or enabling mutating adapters. |
| Provider/topology matrix | Implemented foundation | `POST /api/native-foundation/provider-topology-matrix` reports per-site/per-cluster provider, topology, planned phase, and evidence readiness blockers for heterogeneous multi-site intents without contacting hardware. |
| Provider operation catalog | Implemented foundation | `POST /api/native-foundation/provider-operation-catalog` expands each site/cluster matrix row into disabled provider and deployment operations for discovery, power, boot, image mount, imaging, HCI create, compute registration, storage formation, mixed topology validation, and Prism Element validation without running them. |
| Provider operation admission review | Implemented foundation | `POST /api/native-foundation/provider-operation-admission-review` turns catalog operations into blocked per-operation admission records with approval/evidence binding status without persisting admission decisions or running operations. |
| Provider operation queue plan | Implemented foundation | `POST /api/native-foundation/provider-operation-queue-plan` turns admission records into deterministic blocked queue items with dependency, execution-graph, provider, deployment, and phase metadata without persisting queues, enqueueing jobs, or running operations. |
| Provider operation queue admission review | Implemented foundation | `POST /api/native-foundation/provider-operation-queue-admission-review` turns queue items into blocked queue-admission records with approval/evidence binding status without persisting queue admission, queue records, jobs, or operations. |
| Native Foundation workflow catalog entry | Implemented foundation | `native-foundation-deploy` is visible as an Infrastructure workflow. |
| Native Foundation YAML intent | Implemented foundation | Sites, providers, deployment types, clusters, and nodes are represented. |
| Dry-run intent validation | Implemented foundation | Validates required fields and role/deployment-type consistency. |
| Deterministic native Foundation plan | Implemented foundation | Generates plan ID, intent hash, discovery hash, summary, and approval metadata. |
| Execution readiness gate | Implemented foundation | Reports blocked imaging/cluster-create gates and evaluates sanitized UAT evidence references. |
| Image source manifest | Implemented foundation | Reviews operator-supplied AOS and hypervisor image references, versions, and SHA256-shaped checksums without staging images. |
| Node imaging plan | Implemented foundation | Builds per-node Foundation imaging payload previews from intent, image, network, secret-reference, and discovery-reconciliation metadata without imaging nodes. |
| Cluster formation plan | Implemented foundation | Builds read-only formation payload previews for HCI, compute-only, storage-only, and mixed topologies without creating or registering clusters. |
| Post-create validation plan | Implemented foundation | Builds read-only Prism Element and topology validation payload previews without contacting live clusters. |
| Deployment type support review | Implemented foundation | Builds fail-closed support records for HCI, compute-only, storage-only, and mixed topology provider/deployment pairs without enabling mutating support. |
| Network manifest | Implemented foundation | Reviews VIP, BMC, host, CVM, gateway, DNS, NTP, duplicate IP, and subnet membership metadata without configuring networks. |
| Secret reference manifest | Implemented foundation | Reviews named provider and BMC credential references and flags inline secret-like fields without resolving secret values. |
| Secret resolution plan | Implemented foundation | Inventories future secret-store resolution requests without reading, decrypting, or exposing secret values. |
| Secret store binding review | Implemented foundation | Declares read-only lease, audit, RBAC, and adapter-handoff bindings without resolving or exposing secret values. |
| Secret store provider contract review | Implemented foundation | Reviews future secret-store provider metadata, supported auth modes, and required controls without opening leases or resolving values. |
| Secret lease execution review | Implemented foundation | Declares future lease execution records, policy, audit sink, adapter identity, and revocation metadata without opening leases, resolving values, or handing credentials to adapters. |
| Secret audit persistence review | Implemented foundation | Declares future secret audit records, sink, retention, and failure-classification metadata without appending events, reading retained artifacts, or persisting evidence. |
| Read-only execution graph | Implemented foundation | Plans site waves, cluster waves, dependencies, and deployment-type actions without executing them. |
| Live discovery contract manifest | Implemented foundation | Defines provider-specific request/response schemas and evidence requirements without contacting hardware providers. |
| Discovery reconciliation manifest | Implemented foundation | Compares intended nodes with supplied discovery facts and flags missing, unexpected, mismatched, incomplete, or secret-bearing facts without promoting execution. |
| Versioned adapter contracts | Implemented foundation | Lists provider and deployment contracts and evaluates current intent requirements. |
| Provider adapter manifest | Implemented foundation | Exposes the read-only operation scaffold for provider discovery, power, boot, image mount, and imaging adapters. |
| Provider preflight manifest | Implemented foundation | Composes provider, network, image, and secret-reference metadata into a per-site live-discovery prerequisite review without contacting providers. |
| Adapter readiness report | Implemented foundation | Reports cluster-scoped provider/topology blockers and missing UAT evidence without enabling execution. |
| Deployment policy review | Implemented foundation | Checks site windows, max parallelism, approval binding, evidence requirements, and failure policy before any future scheduling. |
| Deployment wave gate review | Implemented foundation | Converts execution graph waves and deployment policy into per-site gate records with approval/evidence binding status without reserving windows or opening waves. |
| Deployment wave rehearsal | Implemented foundation | Builds read-only per-wave UAT packages with evidence packs, recovery actions, runner blockers, operator controls, and blast-radius records without reserving windows or starting execution. |
| Deployment wave authorization review | Implemented foundation | Builds read-only wave authorization records from wave rehearsal, evidence pack approval, permit reviews, lock plans, and runner blockers without persisting authorization or starting execution. |
| Per-cluster evidence packs | Implemented foundation | Binds plan, graph, readiness, and adapter contract data into one read-only record per cluster. |
| Evidence pack approval review | Implemented foundation | Builds per-cluster approval/go-no-go records from evidence packs, Approval Gates, Validation Evidence, and accepted UAT evidence without persisting decisions or enabling execution. |
| Execution admission review | Implemented foundation | Composes readiness, adapter, policy, approval, evidence, controlled UAT completion, and auth-persistence completion-gate metadata before any future execution start. |
| Execution adapter contract | Implemented foundation | Builds deterministic future adapter request envelopes with controlled UAT completion and auth-persistence completion-gate metadata without loading or running adapters. |
| Execution request review | Implemented foundation | Builds deterministic future job submission requests with controlled UAT completion gate metadata without enqueuing jobs. |
| Dry-run execution ledger | Implemented foundation | Records graph steps, adapter request IDs, checkpoint state, and expected evidence outputs without executing adapters. |
| Execution permit review | Implemented foundation | Binds approval, evidence, request, ledger, recovery, job state, retained-export prerequisite, secret-audit prerequisite, and disabled registry draft into a non-issued permit package. |
| Execution lock plan | Implemented foundation | Declares orchestration, site, cluster, adapter locks, retained-export prerequisite, and secret-audit prerequisite without acquiring locks or reserving windows. |
| Execution audit plan | Implemented foundation | Declares audit events and retention artifacts for permit, lock, job-state, retained-export, secret-audit prerequisites, and adapter packet output/export gate summaries without writing audit records or exporting retained evidence. |
| Execution retention plan | Implemented foundation | Declares retention policies, backup targets, restore rehearsal checks, retained-export prerequisite, secret-audit prerequisite, and inherited packet output/export gate summaries without persisting artifacts or running backup/restore. |
| Restart/resume review | Implemented foundation | Composes checkpoints, job state, retention, audit, locks, and scheduler metadata into disabled replay records without replaying queues or restoring checkpoints. |
| Backup/restore review | Implemented foundation | Composes retention targets, restore rehearsal checks, checkpoints, job state, audit, and restart/resume records into a disabled disaster-recovery readiness review without creating backups or restoring state. |
| Runner readiness review | Implemented foundation | Composes final runner blockers for permits, locks, audit, backup/restore review, packet output/export gate summaries, retained-export, secrets, registry, activation, controlled UAT entry, and UAT without starting jobs, loading adapters, or enabling mutation. |
| UAT evidence acceptance review | Implemented foundation | Maps provider/deployment evidence requirements to accepted `foundation_engine.uat_evidence` IDs and approval/evidence bindings without persisting acceptance. |
| Mutating enablement review | Implemented foundation | Composes runner, backup/restore, UAT evidence acceptance, controlled UAT signoff, controlled UAT execution authorization, carried authorization-persistence provenance, runtime admission, preflight, connectivity, credential, command, output evidence, and retained export reviews into a disabled final execution-enable gate. |
| Execution request persistence admission review | Implemented foundation | Declares future execution request persistence admission records from request envelopes plus controlled UAT completion and auth-persistence completion-gate summaries without persisting request state, enqueueing jobs, submitting jobs, starting runners, or mutating hardware. |
| Execution submission review | Implemented foundation | Builds future per-wave job submission envelopes from mutating enablement, carried authorization-persistence enablement gate status, request persistence admission, controlled UAT completion and auth-persistence completion-gate summaries, scheduler, runner readiness, and controlled UAT entry reviews without enqueueing jobs or enabling deployment execution. |
| Execution submission persistence admission review | Implemented foundation | Declares future execution submission persistence admission records from submission envelopes, carried authorization-persistence enablement gate status, and controlled UAT completion gate summaries without persisting submission state, queue records, replay registrations, submitted jobs, or worker state. |
| Queue persistence review | Implemented foundation | Declares future per-wave queue records from execution submission persistence admission, carried authorization-persistence enablement gate status, controlled UAT completion gate summaries, job state, audit, retention, and restart/resume reviews without persisting records, registering replay, or enqueueing jobs. |
| Queue persistence admission review | Implemented foundation | Declares future queue persistence admission records from queue persistence review, carried authorization-persistence enablement gate status, and controlled UAT completion gate summaries without persisting queue state, registering replay, enqueueing jobs, or persisting job state. |
| Execution authorization persistence admission review | Implemented foundation | Declares future execution authorization persistence admission records from controlled UAT execution authorization, runner persistence admission, carried queue-admission provenance, carried authorization-persistence enablement gate status, controlled UAT completion gate summaries, and carried authorization-persistence provenance when present, while preserving the disabled placeholder cycle-breaker without persisting authorization, job state, queue state, submitted jobs, or adapter output. |
| Job persistence admission review | Implemented foundation | Declares future durable job, queue, checkpoint, authorization, audit, retention, and replay admission records from queue persistence admission, carried authorization-persistence enablement gate status, controlled UAT completion gate summaries, execution authorization persistence admission, carried authorization queue-admission provenance, and carried authorization-persistence provenance when present without writing records or submitting jobs. |
| Mutating adapter binding review | Implemented foundation | Declares future mutating adapter binding records from provider operation queue admission, queue persistence admission, job persistence admission, carried authorization-persistence enablement gate status, controlled UAT completion gate summaries, authorization persistence admission provenance, carried authorization-persistence provenance, activation, allow-list, runtime admission, preflight, connectivity, credential handoff, plan hashes, approval metadata, and UAT evidence without persisting bindings or loading adapters. |
| Controlled UAT lane selection review | Implemented foundation | Declares bounded provider, deployment-type, site, queue-admission, authorization-persistence, carried authorization-persistence enablement gate status, controlled UAT completion gate summaries, carried authorization-persistence, and adapter-binding lanes from binding, support, scope, signoff, and UAT evidence reviews without persisting selections, reserving hardware, or issuing UAT entry. |
| Controlled UAT lane persistence admission review | Implemented foundation | Declares future lane persistence admission records from lane selection, queue-admission provenance, authorization-persistence provenance, carried authorization-persistence enablement gate status, controlled UAT completion gate summaries, carried authorization-persistence provenance, job persistence admission, mutating adapter binding, and scope reviews without persisting lane selections, admitting hardware reservation, reserving hardware, or issuing UAT entry. |
| Controlled UAT hardware reservation review | Implemented foundation | Declares future hardware reservation records from UAT lane persistence admission, provider operation queue admission provenance, queue-admission provenance, authorization-persistence provenance, carried authorization-persistence enablement gate status, controlled UAT completion gate summaries, carried authorization-persistence provenance, deployment windows, scheduler items, locks, and operations review without persisting reservations, opening maintenance windows, or issuing UAT entry. |
| Controlled UAT reservation persistence admission review | Implemented foundation | Declares future hardware reservation persistence admission records from reservation, provider operation queue admission provenance, queue-admission provenance, authorization-persistence provenance, carried authorization-persistence enablement gate status, controlled UAT completion gate summaries, carried authorization-persistence provenance, signoff, operations, and UAT evidence reviews without persisting reservations, opening maintenance windows, reserving hardware, or issuing UAT entry. |
| Controlled UAT entry review | Implemented foundation | Composes final bounded-UAT entry blockers, controlled UAT signoff requirement, hardware reservation review, retained-export prerequisite, secret-audit prerequisite, and inherited packet output/export gate summaries without authorizing hardware testing or loading adapters. |
| Controlled UAT entry issuance review | Implemented foundation | Assembles future UAT entry issuance records from entry, hardware reservation, reservation persistence admission, provider operation queue admission provenance, queue-admission provenance, authorization-persistence provenance, carried authorization-persistence enablement gate status, controlled UAT completion gate summaries, carried authorization-persistence provenance, signoff, and evidence acceptance reviews without persisting or issuing entry, starting UAT, or enabling adapter execution. |
| Controlled UAT entry persistence admission review | Implemented foundation | Declares future UAT entry persistence admission records from entry issuance, reservation persistence admission, provider operation queue admission provenance, queue-admission provenance, authorization-persistence provenance, carried authorization-persistence enablement gate status, controlled UAT completion gate summaries, carried authorization-persistence provenance, signoff, runbook, and evidence acceptance reviews without persisting entry, issuing UAT entry, starting UAT, or starting runners. |
| Controlled UAT start readiness review | Implemented foundation | Declares future UAT start records from entry persistence admission, provider operation queue admission provenance, queue-admission provenance, authorization-persistence provenance, carried authorization-persistence enablement gate status, controlled UAT completion gate summaries, and carried authorization-persistence provenance controls without starting UAT, opening windows, starting runners, executing adapters, or calling Foundation. |
| Controlled UAT start persistence admission review | Implemented foundation | Declares future UAT start persistence admission records from start readiness, entry persistence admission, provider operation queue admission provenance, queue-admission provenance, authorization-persistence provenance, carried authorization-persistence enablement gate status, controlled UAT completion gate summaries, carried authorization-persistence provenance, and lock controls without persisting start state, starting UAT, starting runners, executing adapters, or mutating hardware. |
| Controlled UAT runner admission review | Implemented foundation | Declares future runner admission records from start persistence admission, provider operation queue admission provenance, queue-admission provenance, authorization-persistence provenance, carried authorization-persistence enablement gate status, controlled UAT completion gate summaries, carried authorization-persistence provenance, runtime admission, runtime isolation, and runner readiness reviews without admitting runtimes, starting runners, executing adapters, or mutating hardware. |
| Controlled UAT runner persistence admission review | Implemented foundation | Declares future runner admission persistence records from runner admission, start persistence admission, provider operation queue admission provenance, queue-admission provenance, authorization-persistence provenance, carried authorization-persistence enablement gate status, controlled UAT completion gate summaries, and carried authorization-persistence provenance controls without persisting admission, admitting runners, starting runners, executing adapters, or mutating hardware. |
| Controlled UAT execution authorization review | Implemented foundation | Declares future execution authorization records from runner persistence admission, queue-admission provenance, carried authorization-persistence enablement gate status, controlled UAT completion gate summaries, carried authorization-persistence provenance, preflight, target connectivity, credential handoff, command invocation, and output evidence reviews without authorizing execution, invoking adapters, submitting jobs, or mutating hardware. |
| Controlled UAT completion review | Implemented foundation | Declares future UAT completion records from execution authorization, controlled UAT completion gate summaries, output evidence, retained evidence export, signoff, and evidence acceptance reviews without persisting completion, promoting adapters, certifying production support, submitting jobs, or mutating hardware. |
| Controlled UAT scope review | Implemented foundation | Declares bounded site, cluster, node, provider, topology, artifact scope, retained-export prerequisite, secret-audit prerequisite, and inherited packet output/export gate summaries without reserving hardware or authorizing UAT. |
| Controlled UAT runbook review | Implemented foundation | Reviews UAT window, rollback owner, evidence-retention target, prerequisite artifacts, packet output/export gate summaries, and operator steps without approving UAT. |
| Controlled UAT security review | Implemented foundation | Reviews security reviewer metadata, secret boundaries, retained-export prerequisite, secret-audit prerequisite, packet output/export gate summaries, audit/retention posture, and disabled adapter registry state without approving UAT. |
| Controlled UAT operations review | Implemented foundation | Reviews operations owner metadata, private change ticket, backup evidence, retained-export prerequisite, secret-audit prerequisite, packet output/export gate summaries, recovery posture, retention posture, and lock scope without approving UAT. |
| Controlled UAT signoff review | Implemented foundation | Composes scope, runbook, security, operations, UAT evidence acceptance, allow-list, retained-export prerequisite, secret-store provider contract, secret-audit prerequisite, and packet output/export gate summaries without persisting signoff. |
| Recovery plan | Implemented foundation | Builds read-only stop, retry, rollback, checkpoint, evidence, retained-export, secret-audit prerequisite, and packet output/export gate summary actions without executing recovery. |
| Durable review job | Implemented foundation | Queues a read-only native Foundation rehearsal through Jobs / Queue and persists logs/history without deploying. |
| Resume checkpoint manifest | Implemented foundation | Computes read-only next, pending, completed, failed, and blocked step state from graph dependencies. |
| Adapter promotion review | Implemented foundation | Reviews provider/topology promotion blockers before controlled UAT. |
| Native Foundation UAT checklist | Implemented foundation | Generates read-only controlled-UAT cases for a scoped provider and deployment type. |
| Adapter UAT rehearsal | Implemented foundation | Generates read-only provider, deployment, evidence, and artifact cases for controlled hardware UAT preparation. |
| Adapter activation review | Implemented foundation | Reviews provider/deployment selection, UAT evidence, approval binding, rehearsal, promotion state, and controlled UAT completion requirement without enabling adapters. |
| Adapter enablement registry review | Implemented foundation | Builds disabled registry draft entries per provider/deployment pair with controlled UAT completion requirements without persisting status changes or loading adapters. |
| Adapter allow-list review | Implemented foundation | Builds read-only allow-list approval artifacts from disabled registry drafts with controlled UAT completion requirements without persisting entries or enabling adapters. |
| Adapter load plan review | Implemented foundation | Builds read-only adapter load plan entries from allow-list, controlled UAT completion requirement, signoff, retained-export prerequisite, secret-audit prerequisite, packet output/export gate summaries, and contract reviews without importing code or starting runners. |
| Adapter package provenance review | Implemented foundation | Records package owner, reference, SHA256, signature, signer, controlled UAT completion requirement, retained-export prerequisite, secret-audit prerequisite, and packet output/export gate summary metadata without reading packages or verifying signatures. |
| Adapter SBOM review | Implemented foundation | Records SBOM owner, reference, format, SHA256, vulnerability scan reference, controlled UAT completion requirement, retained-export prerequisite, secret-audit prerequisite, and packet output/export gate summary metadata without generating SBOMs, reading SBOMs, or scanning packages. |
| Adapter runtime isolation review | Implemented foundation | Records runtime owner, isolation profile, sandbox image, network policy, filesystem policy, controlled UAT completion requirement, retained-export prerequisite, secret-audit prerequisite, and packet output/export gate summary metadata without creating sandboxes, applying policies, or starting adapter processes. |
| Adapter runtime admission review | Implemented foundation | Records runtime admission owner, approval reference, change ticket, exception reference, controlled UAT completion requirement, retained-export prerequisite, secret-audit prerequisite, and packet output/export gate summary metadata without admitting runtimes, loading adapters, handing credentials to adapters, or submitting mutating jobs. |
| Adapter execution preflight review | Implemented foundation | Records preflight owner, evidence, command, connectivity, rollback, controlled UAT completion requirement, retained-export prerequisite, secret-audit prerequisite, and packet output/export gate summary metadata without running commands, resolving secrets, opening target connections, or submitting jobs. |
| Adapter target connectivity review | Implemented foundation | Records connectivity owner, scope, target allow-list, maintenance window, probe plan, controlled UAT completion requirement, retained-export prerequisite, secret-audit prerequisite, and packet output/export gate summary metadata without opening sockets, running probes, resolving secrets, or contacting targets. |
| Adapter credential handoff review | Implemented foundation | Records handoff owner, credential handoff, secret lease policy, adapter identity, redaction policy, controlled UAT completion requirement, retained-export prerequisite, secret-audit prerequisite, and packet output/export gate summary metadata without opening leases, resolving secrets, or handing credentials to adapters. |
| Adapter command invocation review | Implemented foundation | Records command owner, catalog, invocation policy, execution identity, output capture, controlled UAT completion requirement, retained-export prerequisite, secret-audit prerequisite, and packet output/export gate summary metadata without assembling commands, writing command files, invoking adapters, or capturing live output. |
| Adapter output evidence review | Implemented foundation | Records output evidence owner, retention, redaction, failure classification, evidence-store, controlled UAT completion requirement, retained-export prerequisite, secret-audit prerequisite, and packet output/export gate summary metadata without capturing output, writing artifacts, persisting evidence, or classifying live failures. |
| Retained evidence export review | Implemented foundation | Declares future retained evidence export items, RBAC/checksum metadata, source retention/output evidence bindings, controlled UAT completion requirement, output-evidence prerequisite artifacts, source review statuses, and packet output/export gate summaries without reading artifacts, generating ZIPs, or persisting evidence. |
| Deployment window reservation review | Implemented foundation | Builds read-only reservation requests from deployment windows, wave authorization, and lock plans without persisting reservations, acquiring locks, or opening waves. |
| Deployment scheduler review | Implemented foundation | Builds disabled schedule items from reservations, execution request metadata, dry-run ledger entries, permit, locks, recovery actions, and job-state plans without opening waves or enqueuing jobs. |
| Review packet export | Implemented foundation | Downloads a redacted ZIP with plan, readiness, provider/topology matrix, provider operation catalog, provider operation admission, provider operation queue plan, provider operation queue admission, imaging, formation, post-create validation, graph, admission, contracts, packs, evidence pack approval, deployment wave rehearsal, deployment wave authorization, deployment window reservation, deployment scheduler, checkpoint, request persistence admission, submission persistence admission, queue persistence, queue persistence admission, dry-run ledger, permit, lock plan, audit plan, retention plan, runner readiness, controlled UAT entry, controlled UAT lane persistence admission, controlled UAT hardware reservation, controlled UAT reservation persistence admission, controlled UAT entry issuance, controlled UAT entry persistence admission, controlled UAT start readiness, controlled UAT start persistence admission, controlled UAT runner admission, controlled UAT runner persistence admission, controlled UAT execution authorization, execution authorization persistence admission, job persistence admission, controlled UAT scope, controlled UAT runbook, controlled UAT security, controlled UAT operations, controlled UAT signoff, secret lease execution, secret audit persistence, allow-list, load plan, package provenance, SBOM review, runtime isolation, runtime admission, execution preflight, target connectivity, credential handoff, command invocation, output evidence, retained export review, promotion, checklist, and hashes. |
| Mutating execution | Controlled-UAT Dell only | Run Workflow becomes active for Dell iDRAC Redfish native Foundation intents only when both Dell UAT env gates are true. |
| Manual/static inventory | Implemented foundation | Discovery preview normalizes operator-supplied facts without contacting hardware. |
| Dell iDRAC Redfish | Controlled-UAT deploy gate | Provides a gated Redfish service-root probe and Dell-only controlled-UAT deployment job enablement with `ZTF_NATIVE_FOUNDATION_ENABLE_DELL_IDRAC_DISCOVERY=true` and `ZTF_NATIVE_FOUNDATION_ENABLE_DELL_IDRAC_MUTATION=true`; production use and non-Dell providers remain blocked. |
| HPE iLO Redfish | Planned | Read-only discovery should precede power or boot actions. |
| NX provider | Planned | Must be validated against supported Nutanix behavior. |
| Cisco Intersight provider | Planned | May complement Prism Central Foundation Central where available. |
| HCI deployment | Planning graph only | Requires controlled UAT before mutating support language changes. |
| Compute-only deployment | Planning graph only | Requires version-specific Nutanix support evidence. |
| Storage-only deployment | Planning graph only | Requires version-specific Nutanix support evidence. |
| Multi-site parallel execution | Planning graph only | Read-only waves are implemented; mutating concurrency requires blast-radius controls. |

## Evidence Requirements

Before any row moves from planned to enabled, capture:

- Provider, hardware, AOS, AHV, and Foundation version.
- Read-only discovery evidence.
- Image and network precheck evidence.
- Approval and plan hash evidence.
- Execution logs with secrets and private details redacted.
- Post-run validation and recovery notes.

## Implemented Read-Only Endpoint

`POST /api/native-foundation/discovery/preview` accepts
`native-foundation-deploy` YAML and returns normalized read-only inventory
facts. It does not contact target systems.

`POST /api/native-foundation/discovery/contract` returns a read-only provider
discovery contract for manual inventory, Redfish BMCs, NX APIs, or Cisco
Intersight APIs. It defines adapter inputs, normalized outputs, and evidence
requirements without running live discovery.

`POST /api/native-foundation/discovery/reconcile` compares intended node
serials, BMC addresses, and required inventory fields with supplied
`discoveryFacts` or embedded discovery results. It does not promote execution.

`POST /api/native-foundation/plan` accepts the same YAML and returns read-only
plan hashes and approval metadata for future adapter-bound execution.

`POST /api/native-foundation/execution/readiness` evaluates the current plan
against the evidence gates required before a native Foundation execution adapter
can be enabled.

`POST /api/native-foundation/images/manifest` returns a read-only AOS and
hypervisor image source manifest with checksum and version readiness checks.
It does not download, verify on disk, stage, or mount images.

`POST /api/native-foundation/imaging/plan` returns read-only per-node Foundation
payload previews for future imaging adapters. It does not stage images, change
boot order, mount media, call Foundation, or image nodes.

`POST /api/native-foundation/clusters/formation-plan` returns read-only cluster
formation payload previews for HCI, compute-only, storage-only, and mixed
topologies. It does not create clusters, register compute nodes, form storage
clusters, or call post-create validation APIs.

`POST /api/native-foundation/post-create/validation-plan` returns read-only
Prism Element and topology validation payload previews for each planned cluster.
It does not contact Prism Element, inspect live cluster state, register compute
nodes, or collect live health evidence.

`POST /api/native-foundation/deployment-types/support-review` returns
fail-closed support records that bind topology graph steps, cluster formation
previews, post-create validation previews, adapter readiness, promotion review,
and controlled-UAT checklist cases per provider/deployment type. It does not
enable mutating support, run validation, promote adapters, call Foundation, or
contact hardware.

`POST /api/native-foundation/network/manifest` returns a read-only site, cluster,
and node network manifest with duplicate IP and optional subnet membership
checks. It does not test reachability or configure networks.

`POST /api/native-foundation/secrets/manifest` returns a read-only secret
reference manifest for provider and BMC credential references. It flags inline
password, token, API key, secret, or credential fields by path only and does not
resolve or expose secret values.

`POST /api/native-foundation/secrets/resolution-plan` returns read-only
secret-store resolution requests for future adapter execution. It does not read,
decrypt, unwrap, export, log, or hand off secret values.

`POST /api/native-foundation/secrets/lease-execution-review` returns a
read-only secret lease execution review. It records lease owner, policy, audit
sink, adapter identity, revocation, provider contract, and binding references
while secret-store authentication, lease opening, path reads, value resolution,
audit persistence, adapter handoff, live revocation, and mutating job submission
remain disabled.

`POST /api/native-foundation/secrets/audit-persistence-review` returns a
read-only secret audit persistence review. It records audit owner, policy, sink,
retention, failure-classification, lease execution, provider contract, and
binding references while audit event appends, retained artifact writes, retained
secret material reads, live failure classification, and mutating job submission
remain disabled.

`POST /api/native-foundation/secrets/store-binding-review` returns read-only
secret-store lease, audit, RBAC, and adapter-handoff bindings for credential
references. It does not open leases, resolve values, expose secret-store paths,
authenticate providers, or hand credentials to adapters.

`POST /api/native-foundation/secrets/provider-contract-review` returns a
read-only secret-store provider contract review. It checks provider metadata,
supported auth modes, private provider reference, lease boundary, audit
requirement, RBAC roles, and redaction requirement without authenticating,
opening leases, reading paths, resolving values, or handing credentials to
adapters.

`POST /api/native-foundation/execution/graph` returns a read-only orchestration
graph with per-site waves, per-cluster waves, step dependencies, and
deployment-type-specific actions.

`GET` or `POST /api/native-foundation/adapter-contracts` returns the read-only
adapter contract registry and, for POST requests, evaluates the current intent
against that registry.

`GET` or `POST /api/native-foundation/provider-adapters` returns the read-only
provider adapter operation scaffold. POST scopes the manifest to providers in
the current intent.

`POST /api/native-foundation/provider-preflight` returns a read-only per-site
preflight manifest for future live provider discovery UAT. It composes provider
contract, credential reference, BMC address, image, and network metadata without
contacting BMC, NX, Redfish, or Intersight endpoints.

`POST /api/native-foundation/adapter-readiness` returns a read-only
provider/topology capability report for each cluster target and maps adapter
requirements to accepted `foundation_engine.uat_evidence` entries. Execution
remains disabled even when all evidence requirements are present.

`POST /api/native-foundation/deployment-policy` returns a read-only
blast-radius and deployment-window review. Scheduling remains disabled even
when the policy passes.

`POST /api/native-foundation/deployment-wave-gates/review` returns read-only
site-wave and site-gate records for multi-site scheduling review. It carries
deployment window, concurrency, deployment type, and optional approval/evidence
binding status without reserving windows, opening waves, enqueuing jobs, or
mutating hardware.

`POST /api/native-foundation/deployment-wave-rehearsal` returns read-only
per-wave UAT rehearsal packages that bind site gates, evidence packs, recovery
actions, runner blockers, go/no-go controls, and blast-radius metadata without
reserving windows, opening waves, enqueuing jobs, or mutating hardware.

`POST /api/native-foundation/deployment-waves/authorization-review` returns
read-only wave authorization records that bind wave rehearsal, evidence pack
approval, permit reviews, lock plans, runner blockers, recovery actions, and
blast-radius metadata without persisting authorization, acquiring locks,
reserving windows, opening waves, enqueuing jobs, or mutating hardware.

`POST /api/native-foundation/deployment-windows/reservation-review` returns
read-only reservation requests that bind wave authorization, declared deployment
windows, and site/cluster lock requests without persisting reservations,
acquiring locks, opening waves, enqueuing jobs, or mutating hardware.

`POST /api/native-foundation/deployment-scheduler/review` returns disabled
schedule items that bind reservation records, execution requests, dry-run
ledger entries, permits, lock plans, recovery actions, and job-state plans
without opening waves, creating queue records, starting runners, or mutating
hardware.

`POST /api/native-foundation/evidence-packs` returns one read-only evidence pack
per cluster with plan hashes, graph steps, readiness gates, and adapter contract
requirements.

`POST /api/native-foundation/evidence-packs/approval-review` returns read-only
per-cluster approval records that bind evidence packs to Approval Gate and
Validation Evidence records and evaluate accepted UAT evidence references
without persisting go/no-go decisions or enabling execution.

`POST /api/native-foundation/execution/admission-review` returns read-only
per-cluster admission decisions after composing readiness, adapter readiness,
deployment policy, approval binding, Validation Evidence checks, packet-level
output/export, controlled UAT completion gate summary, and auth-persistence
completion-gate metadata. It does not schedule execution, start deployment, or
call any adapter.

`POST /api/native-foundation/execution/adapter-contract` returns read-only
future adapter request envelopes with plan, approval, evidence, checkpoint,
packet output/export gate, controlled UAT completion gate, auth-persistence
completion-gate metadata, secret-resolution, audit, and redacted-evidence
bindings. It does not load or run adapters.

`POST /api/native-foundation/execution/request-review` returns a read-only
future job submission request with adapter request IDs, packet output/export
gate summaries, controlled UAT completion gate summaries, plan hashes, and
submission metadata. It does not enqueue work or create a job.

`POST /api/native-foundation/execution/dry-run-ledger` returns a read-only
step ledger for the execution graph. It records planned site/cluster steps,
adapter request IDs, packet output/export gate summaries, checkpoint state,
expected evidence outputs, and mutating operation markers without running
adapters or submitting jobs.

`POST /api/native-foundation/execution/permit-review` returns a read-only
execution permit package. It binds approval, Validation Evidence, admission,
request, dry-run ledger, packet output/export gate summaries, recovery,
job-state, and disabled registry draft state plus retained-export and
secret-audit prerequisites without issuing permits, loading adapters, exporting
retained evidence, persisting secret audit entries, or submitting jobs.

`POST /api/native-foundation/execution/lock-plan` returns read-only lock
requests for orchestration, site, cluster, and adapter scopes. It records lock
names, acquisition order, policy metadata, permit/ledger binding, packet
output/export gate summaries, retained-export prerequisite status, and
secret-audit prerequisite status without acquiring locks, writing records,
reserving windows, or submitting jobs.

`POST /api/native-foundation/execution/audit-plan` returns a read-only audit and
retention plan. It declares audit events, source artifacts, retained artifact
targets, retained-export prerequisite coverage, secret-audit prerequisite
coverage, packet output/export gate summaries when approval/evidence bindings
are supplied, and hash-manifest expectations without appending audit records,
persisting retained evidence, exporting ZIPs, persisting secret audit entries,
or submitting jobs.

`POST /api/native-foundation/execution/retention-plan` returns a read-only
retention and backup/restore review. It declares retention policies, backup
targets, restore rehearsal checks, retained-export prerequisite coverage,
secret-audit prerequisite coverage, inherited packet output/export gate summary
counts when approval/evidence bindings are supplied, and RBAC export
expectations without persisting artifacts, creating backups, restoring state,
exporting retained evidence, persisting secret audit entries, or validating
replay.

`POST /api/native-foundation/execution/restart-resume-review` returns a
read-only restart replay plan. It binds checkpoint records, job-state
transitions, retention artifacts, audit plan, lock plan, and deployment
scheduler metadata without replaying queues, restoring checkpoints, acquiring
locks, starting runners, calling adapters, or mutating hardware.

`POST /api/native-foundation/execution/backup-restore-review` returns a
read-only disaster-recovery readiness plan. It binds retention targets, restore
rehearsal checks, checkpoint metadata, job-state metadata, audit metadata, and
restart/resume records without persisting retained artifacts, creating backups,
reading retained evidence, restoring checkpoints, replaying queues, starting
runners, calling adapters, or mutating hardware.

`POST /api/native-foundation/execution/runner-readiness` returns a read-only
final runner blocker review. It composes plan, packet, permit, lock, audit,
backup/restore review, packet output/export gate summary, retained-export,
secret, registry, activation, controlled UAT entry, and controlled-UAT readiness
without starting jobs, loading adapters, issuing permits, exporting retained
evidence, persisting secret audit entries, or mutating hardware.

`POST /api/native-foundation/execution/mutating-enablement-review` returns a
read-only final execution-enable review. It composes runner readiness,
backup/restore, controlled UAT signoff, controlled UAT execution authorization,
carried authorization-persistence provenance, runtime admission, execution
preflight, target connectivity, credential handoff, command invocation, output
evidence, and retained evidence export reviews without issuing UAT entry,
admitting runtimes, authorizing execution, opening target connections, handing
off credentials, invoking adapters, starting runners, enqueuing deployment
jobs, calling Foundation, calling Prism Element, or mutating hardware.

`POST /api/native-foundation/execution/submission-review` returns a read-only
job submission review. It composes mutating enablement, execution request,
deployment scheduler, runner readiness, controlled UAT entry, and carried
authorization-persistence enablement gate status into future per-wave submission
records without enqueueing jobs, starting runners, opening target connections,
handing off credentials, invoking adapters, calling Foundation, calling Prism
Element, or mutating hardware.

`POST /api/native-foundation/execution/submission-persistence-admission-review`
returns a read-only execution submission persistence admission review. It binds
future execution submission envelopes and carried authorization-persistence
enablement gate status plus controlled UAT completion gate summaries into
disabled submission persistence admission records without writing submission
state, persisting queue records, registering replay, enqueueing jobs, starting
runners, invoking adapters, opening sockets, or mutating hardware.

`POST /api/native-foundation/execution/queue-persistence-review` returns a
read-only queue persistence review. It composes execution submission persistence
admission, carried authorization-persistence enablement gate status, controlled
UAT completion gate summaries, job state, audit, retention, and restart/resume
reviews into future per-wave queue records without persisting queue records,
checkpoints, audit events, retention rows, replay registrations, jobs, or
worker state.

`POST /api/native-foundation/execution/queue-persistence-admission-review`
returns a read-only queue persistence admission review. It composes queue
persistence review records and carried authorization-persistence enablement gate
status plus controlled UAT completion gate summaries into disabled admission
records without admitting queue persistence, persisting queue state, writing
checkpoints, registering replay, enqueueing jobs, persisting job state,
submitting jobs, or mutating hardware.

`POST /api/native-foundation/execution/job-persistence-admission-review`
returns a read-only job persistence admission review. It composes queue
persistence admission, carried authorization-persistence enablement gate
status, controlled UAT completion gate summaries, execution authorization
persistence admission, carried authorization queue-admission provenance, and
carried authorization-persistence provenance when present plus the Auth Persist
placeholder boundary, job state, restart/resume, and backup/restore reviews
into future durable persistence admission records without writing job state,
queue, checkpoint, authorization, audit, retention, replay, submitted-job,
worker, adapter, Foundation, Prism Element, BMC, secret-store, or hardware
records.

`POST /api/native-foundation/execution/request-persistence-admission-review`
returns a read-only execution request persistence admission review. It binds
future execution request envelopes plus controlled UAT completion and
auth-persistence completion-gate summaries
into disabled request persistence admission records without writing request
state, enqueueing jobs, submitting jobs, starting runners, invoking adapters,
opening sockets, or mutating hardware.

`POST /api/native-foundation/execution/authorization-persistence-admission-review`
returns a read-only execution authorization persistence admission review. It
binds controlled UAT execution authorization, runner persistence admission,
carried queue-admission provenance, carried authorization-persistence
enablement gate status, controlled UAT completion gate summaries, and carried
authorization-persistence provenance when present into future authorization
persistence admission records.
When no real execution authorization record exists, it returns a disabled
placeholder record as a cycle breaker without persisting authorization,
persisting job state, invoking adapters, capturing output, submitting jobs,
opening sockets, or mutating hardware.

`POST /api/native-foundation/execution/mutating-adapter-binding-review` returns
a read-only mutating adapter binding review. It binds queue persistence
admission, provider operation queue admission, job persistence admission,
carried authorization-persistence enablement gate status, controlled UAT
completion gate summaries, authorization persistence admission provenance,
carried authorization-persistence provenance, adapter activation, allow-list,
runtime admission, execution preflight, target connectivity, credential
handoff, contract version, plan hash, approval metadata, and UAT evidence metadata into
future adapter binding records without persisting job state, persisting
execution authorization, persisting bindings, loading adapters, admitting
runtimes, handing credentials, opening targets, submitting jobs, or executing
adapters.

`POST /api/native-foundation/uat/lane-selection-review` returns a read-only
controlled UAT lane selection review. It binds mutating adapter binding,
deployment type support, controlled UAT scope, controlled UAT signoff, and UAT
evidence acceptance reviews into bounded provider, deployment-type, site, and
adapter-binding lane records with provider operation queue admission, queue
persistence admission, authorization persistence admission, carried
authorization-persistence enablement gate status, controlled UAT completion
gate summaries, and carried authorization-persistence provenance without
persisting selections, reserving hardware, issuing UAT entry, or enabling
mutation.

`POST /api/native-foundation/uat/lane-persistence-admission-review` returns a
read-only controlled UAT lane persistence admission review. It binds lane
selection, provider operation queue admission provenance, queue persistence
admission provenance, authorization persistence admission provenance, carried
authorization-persistence enablement gate status, controlled UAT completion
gate summaries, carried authorization-persistence provenance, job persistence
admission, mutating adapter binding, and controlled UAT scope reviews into
future lane persistence admission records without persisting lane selections,
persisting adapter bindings, admitting hardware reservation, reserving
hardware, issuing UAT entry, or enabling mutation.

`POST /api/native-foundation/uat/hardware-reservation-review` returns a
read-only controlled UAT hardware reservation review. It binds controlled UAT
lane persistence admission, provider operation queue admission provenance,
queue-admission provenance, authorization-persistence provenance, carried
authorization-persistence enablement gate status, controlled UAT completion
gate summaries, carried authorization-persistence provenance, deployment window
reservation, deployment scheduler, execution lock plan, and operations reviews
into future hardware reservation records without persisting reservations,
allocating nodes, opening maintenance windows, issuing UAT entry, or enabling
adapter execution.

`POST /api/native-foundation/uat/reservation-persistence-admission-review`
returns a read-only controlled UAT reservation persistence admission review. It
binds hardware reservation, provider operation queue admission provenance,
queue-admission provenance, authorization-persistence provenance, carried
authorization-persistence enablement gate status, controlled UAT completion
gate summaries, carried authorization-persistence provenance, signoff,
operations, and UAT evidence acceptance reviews into future reservation
persistence admission records without persisting reservations, opening
maintenance windows, reserving hardware, issuing UAT entry, or enabling adapter
execution.

`POST /api/native-foundation/uat/entry-review` returns a read-only controlled
UAT entry decision record. It composes runner readiness, activation, registry,
UAT rehearsal, controlled UAT signoff requirement, hardware reservation review,
secret binding, retained-export, secret-audit, packet output/export gate
summary, audit, and retention reviews without authorizing hardware testing,
opening maintenance windows, loading adapters, resolving secrets, exporting
retained evidence, persisting signoff, persisting secret audit entries, or
starting jobs.

`POST /api/native-foundation/uat/entry-issuance-review` returns a read-only
controlled UAT entry issuance review. It composes controlled UAT entry,
hardware reservation, reservation persistence admission, provider operation
queue admission provenance, queue-admission provenance,
authorization-persistence provenance, carried authorization-persistence
enablement gate status, controlled UAT completion gate summaries, carried
authorization-persistence provenance, signoff, and UAT evidence acceptance
reviews into future entry issuance records without persisting entry, issuing
UAT entry, starting hardware testing, opening maintenance windows, loading
adapters, or enabling adapter execution.

`POST /api/native-foundation/uat/entry-persistence-admission-review` returns a
read-only controlled UAT entry persistence admission review. It binds entry
issuance, reservation persistence admission, queue-admission provenance,
authorization-persistence provenance, carried authorization-persistence
enablement gate status, controlled UAT completion gate summaries, carried
authorization-persistence provenance, signoff, runbook, and UAT evidence acceptance reviews into future entry persistence
admission records without persisting entry, issuing UAT entry, starting
controlled UAT, starting runners, loading adapters, or enabling adapter
execution.

`POST /api/native-foundation/uat/start-readiness-review` returns a read-only
controlled UAT start readiness review. It composes controlled UAT entry
and entry persistence admission records plus queue-admission and
authorization-persistence provenance plus carried authorization-persistence
enablement gate status, controlled UAT completion gate summaries, and carried
authorization-persistence provenance into future start-readiness records without starting UAT, opening maintenance
windows, acquiring locks, starting runners, admitting adapter runtimes,
executing adapters, or calling Foundation.

`POST /api/native-foundation/uat/start-persistence-admission-review` returns a
read-only controlled UAT start persistence admission review. It binds start
readiness, entry persistence admission, queue-admission provenance,
authorization-persistence provenance, carried authorization-persistence
enablement gate status, controlled UAT completion gate summaries, carried
authorization-persistence provenance, and lock records into future start persistence admission records without persisting start
state, starting UAT, starting runners, admitting runtimes, executing adapters,
or mutating hardware.

`POST /api/native-foundation/uat/runner-admission-review` returns a read-only
controlled UAT runner admission review. It composes start persistence
admission, queue-admission provenance, authorization-persistence provenance,
carried authorization-persistence enablement gate status, controlled UAT
completion gate summaries, carried authorization-persistence provenance,
adapter runtime admission, adapter runtime isolation, and runner readiness
reviews into future runner-admission records without persisting admission,
admitting runtimes, starting runners, executing adapters, opening sockets, or
mutating hardware.

`POST /api/native-foundation/uat/runner-persistence-admission-review` returns a
read-only controlled UAT runner persistence admission review. It binds runner
admission, start persistence admission, provider operation queue admission
provenance, queue-admission provenance, and authorization-persistence
provenance plus carried authorization-persistence enablement gate status,
controlled UAT completion gate summaries, and carried authorization-persistence
provenance records into future runner persistence admission records without
persisting admission, admitting runners, starting runners, admitting runtimes,
executing adapters, or mutating hardware.

`POST /api/native-foundation/uat/execution-authorization-review` returns a
read-only controlled UAT execution authorization review. It composes runner
persistence admission, queue-admission provenance, carried
authorization-persistence enablement gate status, controlled UAT completion
gate summaries, carried authorization-persistence provenance, execution
preflight, target connectivity, credential handoff, command invocation, and
output evidence reviews into future authorization records without persisting
authorization, invoking adapters, capturing output, submitting jobs, opening
sockets, or mutating hardware.

`POST /api/native-foundation/uat/completion-review` returns a read-only
controlled UAT completion review. It composes execution authorization, output
evidence, retained evidence export, controlled UAT completion gate summaries,
signoff, and evidence acceptance reviews into future completion records without persisting completion, promoting
adapters, certifying production support, submitting jobs, or mutating hardware.

`POST /api/native-foundation/uat/scope-review` returns a read-only controlled
UAT scope record for selected provider/deployment lanes. It declares site,
cluster, node, wave, evidence, artifact, retained-export prerequisite,
secret-audit prerequisite, inherited packet output/export gate summary, and
policy scope without reserving hardware, authorizing UAT, loading adapters,
exporting retained evidence, persisting secret audit entries, or mutating
infrastructure.

`POST /api/native-foundation/uat/runbook-review` returns a read-only controlled
UAT runbook review. It checks UAT window, rollback owner, evidence-retention
target, retained-export prerequisite, secret-audit prerequisite, and operator
steps plus inherited packet output/export gate summary without approving UAT,
reserving hardware, loading adapters, resolving secrets, exporting retained
evidence, persisting secret audit entries, or starting jobs.

`POST /api/native-foundation/uat/security-review` returns a read-only controlled
UAT security review. It checks security reviewer metadata, private security
review reference, secret boundary, retained-export prerequisite, secret-audit
prerequisite, packet output/export gate summary, audit/retention boundary, and
disabled adapter registry state without approving UAT, persisting signoff,
enabling adapters, resolving secrets, exporting retained evidence, persisting
secret audit entries, or starting jobs.

`POST /api/native-foundation/uat/operations-review` returns a read-only
controlled UAT operations review. It checks operations owner metadata, private
maintenance or change ticket reference, private backup or restore evidence
reference, retained-export prerequisite, secret-audit prerequisite, packet
output/export gate summary, recovery posture, retention posture, and future lock
scope without approving UAT, reserving windows, persisting tickets, acquiring
locks, exporting retained evidence, persisting secret audit entries, or starting
jobs.

`POST /api/native-foundation/uat/signoff-review` returns a read-only controlled
UAT signoff review. It composes scope, runbook, security, operations,
allow-list, retained-export prerequisite, secret-store provider contract, and
secret audit persistence reviews plus packet output/export gate summaries and
private signoff metadata without persisting signoff, issuing UAT entry,
exporting retained evidence, persisting secret audit entries, loading adapters,
or starting jobs.

`POST /api/native-foundation/adapters/load-plan-review` returns a read-only
adapter load plan review. It converts allow-list and controlled UAT signoff
artifacts plus retained-export, secret-audit, and packet output/export gate
prerequisites into not-loaded adapter load entries without reading packages,
importing modules, instantiating adapters, handing credentials to adapters,
exporting retained evidence, persisting secret audit entries, or starting
runners.

`POST /api/native-foundation/adapters/package-provenance-review` returns a
read-only adapter package provenance review. It records package ownership,
private package reference, SHA256 metadata, signature reference, and signer
reference plus controlled UAT completion, retained-export, and secret-audit
prerequisites without reading packages, hashing bytes, verifying signatures,
staging files, importing code, exporting retained evidence, persisting secret
audit entries, or starting runners, and carries packet output/export gate
summaries from the load plan review when approval/evidence bindings are
supplied.

`POST /api/native-foundation/adapters/sbom-review` returns a read-only adapter
SBOM review. It records SBOM ownership, private SBOM reference, SBOM format,
SBOM SHA256 metadata, private vulnerability scan reference, controlled UAT
completion requirement, retained-export prerequisite status, secret audit
persistence prerequisite status, and packet output/export gate summaries
without generating SBOMs, reading SBOM files, parsing component inventories,
running vulnerability scans, staging packages, importing code, exporting
retained evidence, persisting secret audit entries, or starting runners.

`POST /api/native-foundation/adapters/runtime-isolation-review` returns a
read-only adapter runtime isolation review. It records runtime owner, isolation
profile, sandbox image or runtime reference, network policy reference, and
filesystem policy reference plus controlled UAT completion, retained-export,
and secret audit persistence prerequisite status and packet output/export gate
summaries without creating sandboxes, pulling images, mounting packages,
applying policies, registering hooks, importing code, handing credentials to
adapters, exporting retained evidence, persisting secret audit entries, or
starting adapter processes.

`POST /api/native-foundation/adapters/runtime-admission-review` returns a
read-only adapter runtime admission review. It records admission owner, private
runtime admission reference, private change ticket reference, and private
exception reference plus controlled UAT completion, retained-export, and secret
audit persistence prerequisite status and packet output/export gate summaries
without admitting runtime entries, loading adapters, opening secret leases,
handing credentials to adapters, exporting retained evidence, persisting secret
audit entries, starting adapter processes, or submitting mutating jobs.

`POST /api/native-foundation/adapters/execution-preflight-review` returns a
read-only adapter execution preflight review. It records preflight owner,
private preflight evidence reference, adapter command reference, target
connectivity reference, rollback readiness reference, and secret audit
persistence prerequisite status plus controlled UAT completion, retained-export
prerequisite status, and packet output/export gate summaries without running
commands, resolving secrets, opening target connections, calling Foundation,
contacting hardware, exporting retained evidence, persisting secret audit
entries, or submitting mutating jobs.

`POST /api/native-foundation/adapters/target-connectivity-review` returns a
read-only adapter target connectivity review. It records connectivity owner,
private connectivity scope reference, target allow-list reference, maintenance
window reference, probe plan reference, and secret audit persistence
prerequisite status plus controlled UAT completion, retained-export
prerequisite status, and packet output/export gate summaries without opening
sockets, resolving secrets, running reachability probes, calling Foundation,
contacting hardware, exporting retained evidence, persisting secret audit
entries, or submitting mutating jobs.

`POST /api/native-foundation/adapters/credential-handoff-review` returns a
read-only adapter credential handoff review. It records handoff owner, private
credential handoff reference, secret lease policy reference, adapter identity
reference, redaction policy reference, and secret audit persistence
prerequisite status plus controlled UAT completion, retained-export
prerequisite status, and packet output/export gate summaries without opening
leases, resolving secrets, exposing values, handing credentials to adapters,
opening target connections, exporting retained evidence, persisting secret
audit entries, or submitting mutating jobs.

`POST /api/native-foundation/adapters/command-invocation-review` returns a
read-only adapter command invocation review. It records command owner, private
command catalog reference, invocation policy reference, execution identity
reference, output capture reference, and secret audit persistence prerequisite
status plus controlled UAT completion, retained-export prerequisite status, and
packet output/export gate summaries without assembling command lines, writing
command files, invoking adapters, capturing live output, exporting retained
evidence, persisting secret audit entries, or submitting mutating jobs.

`POST /api/native-foundation/adapters/output-evidence-review` returns a
read-only adapter output evidence review. It records output evidence owner,
retention reference, artifact redaction reference, failure classification
reference, evidence-store reference, controlled UAT completion requirement, and
secret audit persistence prerequisite status plus retained-export prerequisite
status and packet output/export gate summaries without capturing stdout or
stderr, writing artifacts, persisting validation evidence, classifying live
failures, exporting retained evidence, persisting secret audit entries, or
submitting mutating jobs.

`POST /api/native-foundation/execution/retained-evidence-export-review` returns
a read-only retained evidence export review. It records export owner, private
export request, retention store, RBAC review, checksum manifest, controlled UAT
completion requirement, inherited output-evidence prerequisite artifacts,
source review statuses, and packet output/export gate summaries while artifact
reads, ZIP generation, checksum writes, evidence persistence, retained evidence
export, and mutating job submission remain disabled.

`POST /api/native-foundation/execution/recovery-plan` returns read-only stop,
retry, rollback, checkpoint, evidence, retained-export, and secret-audit
prerequisite actions plus packet output/export gate summaries for each adapter
request. It does not pause jobs, retry adapters, roll back hardware, or run
recovery commands.

`POST /api/native-foundation/execution/job-state-plan` returns a read-only
durable job state model for queue, running, checkpoint, pause, failure,
recovery, retained-export prerequisites, secret-audit prerequisites, packet
output/export gate summaries, and completion transitions. It does not create
records, acquire locks, replay work, generate retained evidence exports,
persist secret audit entries, or start jobs.

`POST /api/native-foundation/execution/review-job` queues a durable read-only
review job that emits persisted logs for plan, packet, provider/topology matrix,
provider operation catalog, provider operation admission, provider operation queue plan, provider operation queue admission, request, request
persistence admission, submission persistence admission, dry-run ledger,
permit, lock plan, audit plan, retention plan, runner readiness, secret-store
binding, secret lease execution, secret audit persistence, controlled UAT entry,
controlled UAT runner admission, controlled UAT execution authorization,
execution authorization persistence admission completion-gate counts, job
persistence admission,
controlled UAT scope, controlled UAT runbook, controlled UAT security,
controlled UAT operations, controlled UAT signoff, UAT evidence acceptance,
adapter load plan, adapter package provenance, adapter SBOM, adapter runtime
isolation, adapter runtime admission, adapter execution preflight, adapter
target connectivity, adapter credential handoff, adapter command invocation,
adapter output evidence, retained evidence export, mutating enablement,
carried authorization-persistence enablement gate counts, execution submission,
submission persistence admission, queue persistence, queue persistence
admission, job persistence admission, mutating adapter binding, controlled UAT
lane selection, controlled UAT lane persistence admission, hardware
reservation, reservation persistence admission, entry issuance, entry
persistence admission, recovery, and job-state
artifacts. When approval
and evidence IDs are supplied, the job trace and generated artifacts carry the
same packet output/export gate summaries and auth-persistence completion-gate
counts. It does not run deployment adapters or mutate hardware.

`POST /api/native-foundation/resume-checkpoint` returns a read-only restart
position manifest using the current execution graph and optional checkpoint step
IDs in the intent.

`POST /api/native-foundation/adapter-promotion/review` returns a read-only
promotion decision for selected provider and deployment contracts. It remains
blocked until controlled hardware UAT proves the mutating adapter path.

`POST /api/native-foundation/uat/checklist` returns read-only UAT cases and
required evidence for a scoped provider and deployment type.

`POST /api/native-foundation/uat/evidence-acceptance-review` returns a read-only
review that maps selected provider and deployment-type requirements to accepted
`foundation_engine.uat_evidence` IDs. It can report `ready_for_review` when all
required evidence is declared and approval/evidence IDs are supplied, but it
does not persist acceptance, issue UAT entry, enable adapters, submit jobs, or
mutate hardware.

`POST /api/native-foundation/adapter-uat/rehearsal` returns read-only provider,
deployment, evidence, and artifact cases for controlled adapter UAT planning. It
does not run UAT, promote adapters, call Foundation, contact Prism Element, or
mutate hardware.

`POST /api/native-foundation/adapter-activation/review` returns a read-only
final adapter activation gate for provider/deployment scope, required UAT
evidence, approval binding, validation evidence, rehearsal, and promotion
state. It does not enable adapters or execution.

`POST /api/native-foundation/adapter-enablements/review` returns a read-only
adapter registry enablement review. It builds disabled registry draft entries
for each matching provider/deployment pair, links activation request IDs, lists
blocked mutating operations, and leaves adapter loading and registry mutation
disabled.

`POST /api/native-foundation/adapter-allowlist/review` returns a read-only
adapter allow-list review. It turns disabled registry drafts into scoped
allow-list approval artifacts and checks security, operations, and secret-store
provider contract review availability without persisting entries, loading
adapters, or starting jobs.

`POST /api/native-foundation/adapters/load-plan-review` returns a read-only
adapter load plan review. It turns allow-list, signoff, retained-export
prerequisite, secret audit persistence, packet output/export gate summaries,
and contract reviews into not-loaded adapter entries without package reads,
imports, runtime instantiation, credential handoff, retained evidence export,
secret audit persistence, or runner start.

`POST /api/native-foundation/adapters/package-provenance-review` returns a
read-only adapter package provenance review. It records package references,
SHA256 metadata, signature reference, signer reference, retained-export
prerequisite status, secret audit persistence prerequisite status, and packet
output/export gate summaries while package reads, signature verification,
staging, imports, retained evidence export, secret audit persistence, and runner
start remain disabled.

`POST /api/native-foundation/adapters/sbom-review` returns a read-only adapter
SBOM review. It records SBOM references, supported format metadata, SHA256
metadata, vulnerability scan references, retained-export prerequisite status,
secret audit persistence prerequisite status, and packet output/export gate
summaries while SBOM generation, SBOM reads, component parsing, vulnerability
scans, package staging, imports, retained evidence export, secret audit
persistence, and runner start remain disabled.

`POST /api/native-foundation/adapters/runtime-isolation-review` returns a
read-only adapter runtime isolation review. It records runtime owner, supported
isolation profile metadata, sandbox image references, network policy
references, filesystem policy references, retained-export prerequisite status,
secret audit persistence prerequisite status, and packet output/export gate
summaries while sandbox creation, policy application, hook registration,
credential handoff, retained evidence export, secret audit persistence, adapter
process start, and runner start remain disabled.

`POST /api/native-foundation/adapters/runtime-admission-review` returns a
read-only adapter runtime admission review. It records admission owner,
admission references, change ticket references, exception references, and
retained-export and secret audit persistence prerequisite status plus packet
output/export gate summaries while runtime admission, adapter loading,
credential handoff, retained evidence export, secret audit persistence, adapter
process start, mutating job submission, Foundation calls, Prism Element calls,
and BMC contact remain disabled.

`POST /api/native-foundation/adapters/execution-preflight-review` returns a
read-only adapter execution preflight review. It records preflight owner,
preflight evidence, adapter command, target connectivity, rollback readiness,
retained-export prerequisite status, and secret audit persistence prerequisite
status plus packet output/export gate summaries while command execution, secret
resolution, target connectivity, Foundation calls, Prism Element calls, BMC
contact, hardware contact, retained evidence export, secret audit persistence,
and mutating job submission remain disabled.

`POST /api/native-foundation/adapters/target-connectivity-review` returns a
read-only adapter target connectivity review. It records connectivity owner,
connectivity scope, target allow-list, maintenance window, probe plan, and
retained-export and secret audit persistence prerequisite status plus packet
output/export gate summaries while socket opening, authentication, secret
resolution, reachability probes, Foundation calls, Prism Element calls, BMC
contact, hardware provider contact, retained evidence export, secret audit
persistence, and mutating job submission remain disabled.

`POST /api/native-foundation/adapters/credential-handoff-review` returns a
read-only adapter credential handoff review. It records handoff owner,
credential handoff, secret lease policy, adapter identity, and redaction policy
references plus retained-export and secret audit persistence prerequisite
status plus packet output/export gate summaries while lease opening, secret
resolution, decryption, value exposure, credential handoff, target
connectivity, retained evidence export, secret audit persistence, and mutating
job submission remain disabled.

`POST /api/native-foundation/adapters/command-invocation-review` returns a
read-only adapter command invocation review. It records command owner, command
catalog, invocation policy, execution identity, output capture, and secret
audit persistence prerequisite status plus retained-export prerequisite status
and packet output/export gate summaries while command assembly, command file
writes, adapter invocation, process start, target connectivity, secret
resolution, live output capture, retained evidence export, secret audit
persistence, and mutating job submission remain disabled.

`POST /api/native-foundation/adapters/output-evidence-review` returns a
read-only adapter output evidence review. It records output evidence owner,
retention, redaction, failure classification, evidence-store, controlled UAT
completion requirement, and secret audit persistence prerequisite status plus
retained-export prerequisite status and packet output/export gate summaries
while stdout capture, stderr capture, artifact writes, evidence persistence,
live failure classification, retained evidence export, secret audit
persistence, and mutating job submission remain disabled.

`POST /api/native-foundation/execution/retained-evidence-export-review` returns
a read-only retained evidence export review. It records export owner, request,
retention store, RBAC review, checksum manifest, retention plan, output
evidence, controlled UAT completion requirement, secret audit persistence
prerequisite status, and packet output/export gate summaries while retained
artifact reads, copy operations, ZIP generation, checksum writes, persisted
Validation Evidence, retained evidence export, and mutating job submission
remain disabled.

`POST /api/native-foundation/review-packet` downloads a redacted ZIP bundle of
the native Foundation review artifacts, provider/topology matrix, provider
operation catalog, provider operation admission review, provider operation queue plan, provider operation queue admission review, controlled UAT entry review, controlled
UAT scope review, controlled UAT runbook review, controlled UAT security review,
controlled UAT operations review, controlled UAT completion review,
secret-store provider contract review, secret lease execution review, secret
audit persistence review, UAT evidence acceptance review,
adapter allow-list review, adapter load plan review, adapter package provenance
review, adapter SBOM review, adapter runtime isolation review, adapter runtime
admission review, adapter execution preflight review, adapter target
connectivity review, adapter credential handoff review, adapter command
invocation review, adapter output evidence review, retained evidence export
review, manifest-level output/export and controlled UAT completion gate summary,
and SHA256 manifest.
