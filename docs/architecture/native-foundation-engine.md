# Native Foundation Engine Architecture

Current release marker: `v1.8.0`.

The native Foundation engine is the planned ZTF-Orchestrator capability for
operator-owned bare-metal deployment planning across multiple sites, hardware
providers, and Nutanix cluster deployment types. In this release it is
planning-only: it validates intent shape and policy, but it does not image
nodes, power-cycle hardware, create clusters, or replace Nutanix-supported
Foundation execution paths.

## Goal

ZTF-Orchestrator should become the operator-facing Foundation deployment plane
for heterogeneous environments where Prism Central Foundation Central or
standalone Foundation Central Appliance does not expose the needed hardware
provider or cluster topology.

The target capability is:

- Plan deployments across multiple sites and clusters.
- Normalize hardware inventory from NX, Cisco Intersight, Redfish BMCs, and
  manual inventory.
- Represent HCI, compute-only, storage-only, and mixed cluster topologies.
- Gate mutating deployment work through RBAC, approvals, job state, audit, and
  validation evidence.
- Run post-create Prism Element and Prism Central configuration through the
  existing guarded Orchestrator workflows.

## Boundaries

- Nutanix Foundation, Foundation Central, Portable Foundation, AOS, AHV,
  Phoenix, and platform firmware remain vendor-controlled deployment
  components.
- Public repository content must not include Nutanix binaries, extracted
  proprietary source, private support portal artifacts, lab endpoints,
  credentials, or customer hardware data.
- Execution adapters must be version-aware and validated in controlled UAT
  before they can be advertised as deployment-capable.
- Until an adapter is validated, native Foundation is limited to read-only
  planning, validation, evidence templates, and operator review.
- `GET /api/native-foundation/phases` exposes the current phase catalog,
  release marker, execution mode, supported readiness phases, and
  `mutatingActionsEnabled: false` status for every phase.
- `POST /api/native-foundation/phases/advancement-review` binds a requested
  phase to the current intent and reports promotion blockers without changing
  phase state or enabling mutating adapters.
- `POST /api/native-foundation/provider-topology-matrix` evaluates each
  site/cluster against provider contracts, deployment topology contracts, phase
  evidence requirements, and accepted UAT evidence without contacting hardware.
- `POST /api/native-foundation/provider-operation-catalog` expands each
  site/cluster matrix row into disabled provider and deployment operations so
  HCI, compute-only, storage-only, and mixed topology run requirements are
  visible before controlled UAT.
- `POST /api/native-foundation/provider-operation-admission-review` converts
  the catalog into read-only per-operation admission records without persisting
  admission decisions or allowing operations to run.
- `POST /api/native-foundation/provider-operation-queue-plan` converts
  admission records into deterministic read-only queue items with dependency,
  graph, provider, deployment, and phase metadata without persisting or
  enqueueing operations.
- `POST /api/native-foundation/provider-operation-queue-admission-review`
  converts queue-plan items into blocked queue-admission records without
  persisting admission decisions, queue records, or jobs.
- `POST /api/native-foundation/discovery/preview` normalizes
  operator-supplied intent into read-only inventory facts; it does not contact
  target systems in this release.
- `POST /api/native-foundation/discovery/contract` defines provider-specific
  live-discovery request and response contracts without running live discovery.
- `POST /api/native-foundation/discovery/reconcile` compares supplied discovery
  facts with the intended node plan without promoting execution.
- `POST /api/native-foundation/plan` computes deterministic read-only plan
  metadata and hashes for future approval-bound execution.
- `POST /api/native-foundation/execution/readiness` reports the evidence gates
  that block imaging or cluster-create execution until UAT accepts them.
- `POST /api/native-foundation/secrets/store-binding-review` declares
  read-only secret-store lease, audit, RBAC, and adapter-handoff bindings
  without resolving secrets.
- `POST /api/native-foundation/execution/admission-review` composes readiness,
  adapter, deployment policy, approval, and evidence checks before any future
  execution start.
- `POST /api/native-foundation/execution/adapter-contract` builds read-only
  future adapter request envelopes without loading or running adapters.
- `POST /api/native-foundation/execution/request-review` builds the read-only
  future execution submission object without creating a job.
- `POST /api/native-foundation/execution/dry-run-ledger` builds a read-only
  step ledger from the execution graph and adapter request IDs without running
  adapters.
- `POST /api/native-foundation/execution/permit-review` builds a read-only
  execution permit package without issuing a permit or submitting jobs.
- `POST /api/native-foundation/execution/lock-plan` builds read-only
  orchestration, site, cluster, and adapter lock requests without acquiring
  locks.
- `POST /api/native-foundation/execution/audit-plan` builds read-only audit
  event and retained-artifact declarations without writing audit records.
- `POST /api/native-foundation/execution/retention-plan` builds read-only
  retention policy, backup target, and restore rehearsal declarations without
  running backup/restore.
- `POST /api/native-foundation/execution/runner-readiness` builds the final
  read-only runner blocker review without starting execution.
- `POST /api/native-foundation/secrets/provider-contract-review` builds a
  read-only secret-store provider contract review without authenticating,
  opening leases, resolving values, or handing credentials to adapters.
- `POST /api/native-foundation/adapter-allowlist/review` builds a read-only
  adapter allow-list review without persisting entries, loading adapters, or
  enabling execution.
- `POST /api/native-foundation/adapters/load-plan-review` builds a read-only
  adapter load plan review with inherited packet output/export gate evidence,
  without reading adapter packages, importing code, instantiating adapters,
  handing off credentials, or starting runners.
- `POST /api/native-foundation/adapters/package-provenance-review` builds a
  read-only adapter package provenance review with inherited packet
  output/export gate evidence, without reading packages, hashing bytes,
  verifying signatures, staging files, or importing code.
- `POST /api/native-foundation/adapters/sbom-review` builds a read-only adapter
  SBOM review with inherited packet output/export gate evidence, without
  generating SBOMs, reading SBOMs, parsing component inventories, running
  vulnerability scans, staging packages, or importing code.
- `POST /api/native-foundation/adapters/runtime-isolation-review` builds a
  read-only adapter runtime isolation review with inherited packet
  output/export gate evidence, without creating sandboxes, applying policies,
  registering hooks, importing code, handing off credentials, or starting
  adapter processes.
- `POST /api/native-foundation/adapters/runtime-admission-review` builds a
  read-only adapter runtime admission review with inherited packet
  output/export gate evidence, without admitting runtimes, loading adapters,
  handing off credentials, submitting mutating jobs, or contacting deployment
  targets.
- `POST /api/native-foundation/adapters/execution-preflight-review` builds a
  read-only adapter execution preflight review with inherited packet
  output/export gate evidence, without running commands, resolving secrets,
  opening target connections, contacting deployment targets, or submitting
  mutating jobs.
- `POST /api/native-foundation/adapters/target-connectivity-review` builds a
  read-only adapter target connectivity review with inherited packet
  output/export gate evidence, without opening sockets, authenticating, running
  probes, resolving secrets, contacting deployment targets, or submitting
  mutating jobs.
- `POST /api/native-foundation/adapters/credential-handoff-review` builds a
  read-only adapter credential handoff review with inherited packet
  output/export gate evidence, without opening leases, resolving secrets,
  exposing values, handing credentials to adapters, opening target connections,
  or submitting mutating jobs.
- `POST /api/native-foundation/adapters/command-invocation-review` builds a
  read-only adapter command invocation review with inherited packet
  output/export gate evidence, without assembling commands, writing command
  files, invoking adapters, capturing live output, or submitting mutating jobs.
- `POST /api/native-foundation/adapters/output-evidence-review` builds a
  read-only adapter output evidence review with inherited packet output/export
  gate evidence, without capturing stdout or stderr, writing artifacts,
  persisting evidence, classifying live failures, or exporting retained
  evidence.
- `POST /api/native-foundation/execution/retained-evidence-export-review`
  builds a read-only retained evidence export review with inherited packet
  output/export gate evidence, without reading retained artifacts, generating
  ZIPs, writing checksum manifests, persisting evidence, or submitting mutating
  jobs.
- `POST /api/native-foundation/uat/entry-review` builds a read-only controlled
  UAT entry decision record without authorizing hardware testing or loading
  adapters.
- `POST /api/native-foundation/uat/scope-review` builds a read-only bounded
  site, cluster, node, provider, topology, and artifact scope review without
  reserving hardware or authorizing UAT.
- `POST /api/native-foundation/uat/runbook-review` builds a read-only
  controlled-UAT runbook metadata review without approving UAT.
- `POST /api/native-foundation/uat/security-review` builds a read-only
  controlled-UAT security review without persisting signoff or enabling
  adapters.
- `POST /api/native-foundation/uat/operations-review` builds a read-only
  controlled-UAT operations review with inherited packet output/export gate
  evidence, without reserving windows, acquiring locks, persisting change
  tickets, or approving UAT.
- `POST /api/native-foundation/uat/signoff-review` builds a read-only
  controlled-UAT signoff review with inherited packet output/export gate
  evidence, without persisting signoff, issuing UAT entry, loading adapters, or
  starting runners.
- `POST /api/native-foundation/execution/recovery-plan` builds read-only stop,
  retry, rollback, checkpoint, and evidence actions with inherited packet
  output/export gate evidence, without executing recovery.
- `POST /api/native-foundation/execution/job-state-plan` builds the read-only
  durable job state and replay model with inherited packet output/export gate
  evidence, without writing records or starting jobs.
- `POST /api/native-foundation/execution/review-job` queues a durable
  review-only rehearsal job that writes logs and history without deployment
  mutation.
- `POST /api/native-foundation/imaging/plan` builds read-only per-node
  Foundation imaging payload previews without staging images or imaging nodes.
- `POST /api/native-foundation/clusters/formation-plan` builds read-only
  formation payload previews for HCI, compute-only, storage-only, and mixed
  topologies without creating clusters.
- `POST /api/native-foundation/post-create/validation-plan` builds read-only
  Prism Element and topology validation payload previews without contacting live
  clusters.
- `POST /api/native-foundation/secrets/manifest` reports required credential
  references and inline secret findings without resolving secret values.
- `POST /api/native-foundation/secrets/resolution-plan` inventories future
  secret-store resolution requests without reading or exposing secret values.
- `POST /api/native-foundation/secrets/store-binding-review` declares
  read-only lease, audit, RBAC, and adapter handoff bindings without resolving
  secret values.
- `POST /api/native-foundation/secrets/provider-contract-review` builds a
  read-only secret-store provider contract review without approving providers,
  opening leases, resolving values, or persisting provider configuration.
- `POST /api/native-foundation/secrets/lease-execution-review` builds a
  read-only secret lease execution review without authenticating to a secret
  store, opening leases, resolving values, persisting audit records, handing
  credentials to adapters, or submitting jobs.
- `POST /api/native-foundation/secrets/audit-persistence-review` builds a
  read-only secret audit persistence review without appending audit events,
  writing retained artifacts, reading retained secret material, classifying
  live failures, or submitting jobs.
- `POST /api/native-foundation/execution/graph` builds a read-only multi-site
  orchestration graph with site waves, cluster waves, step dependencies, and
  deployment-type-specific actions.
- `GET` or `POST /api/native-foundation/adapter-contracts` exposes the
  versioned read-only provider and deployment contract registry.
- `POST /api/native-foundation/provider-preflight` composes provider, image,
  network, and secret-reference metadata into a per-site preflight review before
  live discovery UAT.
- `POST /api/native-foundation/evidence-packs` generates read-only
  per-cluster evidence packs that bind plan, graph, readiness, and adapter
  contract records.
- `POST /api/native-foundation/resume-checkpoint` generates a read-only
  restart-position manifest from execution graph dependencies and optional
  checkpoint step IDs.
- `POST /api/native-foundation/adapter-promotion/review` composes contracts,
  evidence packs, readiness, and checkpoint state into a read-only controlled
  UAT promotion decision.
- `POST /api/native-foundation/uat/checklist` generates read-only UAT cases and
  required evidence for a scoped provider and deployment type.
- `POST /api/native-foundation/adapter-uat/rehearsal` generates a read-only
  adapter UAT rehearsal plan with provider, deployment, evidence, and artifact
  cases without running UAT.
- `POST /api/native-foundation/adapter-activation/review` generates a
  read-only final activation gate without enabling adapters or execution.
- `POST /api/native-foundation/adapter-enablements/review` generates a
  read-only disabled registry draft for provider/deployment enablement review
  without changing adapter status.
- `POST /api/native-foundation/review-packet` downloads a redacted ZIP bundle
  of native Foundation review artifacts and hashes.

## Logical Components

```text
Browser UI
  Native Foundation deployment intent
  Multi-site and cluster topology review
        |
        v
Flask API
  Intent validation
  Approval and plan hash binding
  Durable job tracking
  Audit and evidence capture
        |
        v
Native Foundation Engine
  Provider adapters
  Topology rules
  Image and network checks
  Execution adapters, disabled until UAT
        |
        v
Nutanix deployment targets
  BMC / Redfish / Intersight / NX
  Foundation-compatible imaging path
  Prism Element and Prism Central post-create APIs
```

## Provider Adapter Contract

Each hardware provider adapter should normalize read-only facts before any
mutating operation is considered:

- Node serial and model.
- BMC endpoint and credential reference.
- Power and boot capability.
- Disk inventory and controller facts.
- NIC inventory and MAC addresses.
- Firmware and boot mode where available.
- Hardware support status and unknown values.

Initial provider IDs are:

- `manual_static`
- `nx`
- `cisco_intersight`
- `dell_idrac_redfish`
- `hpe_ilo_redfish`
- `lenovo_xcc_redfish`

## Deployment Types

The native intent model supports these planning values:

- `hci`
- `compute_only`
- `storage_only`
- `mixed_hci_compute`
- `mixed_storage_compute`

Node roles are:

- `hci`
- `compute_only`
- `storage_only`

Validation must fail closed when cluster deployment type and node roles do not
match.

## Documentation Rule

Every pull request that changes native Foundation behavior must update the
matching documentation in the same change set. At least one of these documents
must be reviewed for each change:

- `docs/foundation-engine-roadmap.md`
- `docs/foundation-engine/intent-schema.md`
- `docs/foundation-engine/support-matrix.md`
- `docs/foundation-engine/topology-rules.md`
- `docs/foundation-engine/discovery-preview.md`
- `docs/foundation-engine/discovery-contract.md`
- `docs/foundation-engine/discovery-reconciliation.md`
- `docs/foundation-engine/plan-approval-binding.md`
- `docs/foundation-engine/approval-binding-review.md`
- `docs/foundation-engine/execution-readiness.md`
- `docs/foundation-engine/image-sources.md`
- `docs/foundation-engine/node-imaging-plan.md`
- `docs/foundation-engine/cluster-formation-plan.md`
- `docs/foundation-engine/post-create-validation-plan.md`
- `docs/foundation-engine/network-manifest.md`
- `docs/foundation-engine/secret-references.md`
- `docs/foundation-engine/secret-resolution-plan.md`
- `docs/foundation-engine/execution-graph.md`
- `docs/foundation-engine/adapter-contracts.md`
- `docs/foundation-engine/adapter-activation-review.md`
- `docs/foundation-engine/adapter-enablement-review.md`
- `docs/foundation-engine/provider-adapters.md`
- `docs/foundation-engine/provider-operation-admission-review.md`
- `docs/foundation-engine/provider-operation-catalog.md`
- `docs/foundation-engine/provider-operation-queue-admission-review.md`
- `docs/foundation-engine/provider-operation-queue-plan.md`
- `docs/foundation-engine/provider-preflight.md`
- `docs/foundation-engine/recovery-plan.md`
- `docs/foundation-engine/job-state-plan.md`
- `docs/foundation-engine/adapter-readiness.md`
- `docs/foundation-engine/deployment-policy.md`
- `docs/foundation-engine/evidence-packs.md`
- `docs/foundation-engine/execution-admission-review.md`
- `docs/foundation-engine/execution-adapter-contract.md`
- `docs/foundation-engine/execution-request-review.md`
- `docs/foundation-engine/dry-run-ledger.md`
- `docs/foundation-engine/execution-permit-review.md`
- `docs/foundation-engine/execution-lock-plan.md`
- `docs/foundation-engine/execution-audit-plan.md`
- `docs/foundation-engine/execution-retention-plan.md`
- `docs/foundation-engine/execution-runner-readiness.md`
- `docs/foundation-engine/adapter-allow-list-review.md`
- `docs/foundation-engine/adapter-load-plan-review.md`
- `docs/foundation-engine/adapter-package-provenance-review.md`
- `docs/foundation-engine/adapter-sbom-review.md`
- `docs/foundation-engine/adapter-runtime-isolation-review.md`
- `docs/foundation-engine/adapter-runtime-admission-review.md`
- `docs/foundation-engine/adapter-execution-preflight-review.md`
- `docs/foundation-engine/adapter-target-connectivity-review.md`
- `docs/foundation-engine/adapter-credential-handoff-review.md`
- `docs/foundation-engine/adapter-command-invocation-review.md`
- `docs/foundation-engine/adapter-output-evidence-review.md`
- `docs/foundation-engine/retained-evidence-export-review.md`
- `docs/foundation-engine/controlled-uat-entry-review.md`
- `docs/foundation-engine/controlled-uat-operations-review.md`
- `docs/foundation-engine/controlled-uat-runbook-review.md`
- `docs/foundation-engine/controlled-uat-security-review.md`
- `docs/foundation-engine/controlled-uat-signoff-review.md`
- `docs/foundation-engine/controlled-uat-scope-review.md`
- `docs/foundation-engine/secret-store-binding-review.md`
- `docs/foundation-engine/secret-store-provider-contract-review.md`
- `docs/foundation-engine/secret-lease-execution-review.md`
- `docs/foundation-engine/secret-audit-persistence-review.md`
- `docs/foundation-engine/resume-checkpoint.md`
- `docs/foundation-engine/adapter-promotion-review.md`
- `docs/foundation-engine/adapter-uat-rehearsal.md`
- `docs/foundation-engine/uat-checklist.md`
- `docs/foundation-engine/review-packet.md`
- `docs/foundation-engine/review-job.md`
- `docs/foundation-central-validation.md`
- `docs/validation-status.md`
- `docs/user-guide.md`
- Relevant runbook or UAT evidence template
