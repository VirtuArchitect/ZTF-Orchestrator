# Validation Status

This document describes what has been validated for ZTF-Orchestrator and what
still requires an environment-specific UAT exercise. It is intended to be
transparent rather than promotional: local validation proves the application
logic and packaging path, while Nutanix infrastructure validation requires real
Prism Central, Foundation Central, Prism Element, and safe test targets.

For the current repository-level security review, see
[Security Assessment](security/SECURITY_ASSESSMENT.md).

## Current Validation Position

ZTF-Orchestrator is locally validated and ready for controlled infrastructure
UAT. It should not be represented as fully production-validated until the
environment-dependent tests below have been executed in the target deployment
model.

## Sanitized UAT Progress

On 2026-06-30, the Orchestrator was connected to a UAT Prism Central
environment. The Configure Prism Central workflow successfully applied NTP and
DNS settings, and drift detection successfully reported the expected state
afterward. Raw evidence, endpoint details, hostnames, addresses, credentials,
logs, and screenshots are intentionally withheld because they relate to a
restricted UAT environment.

On 2026-07-20 and 2026-07-24, a controlled single-node Nutanix Community
Edition lab validated the Deploy Prism Central path through the ZTF 1.x runtime
after Orchestrator hardening. The Prism Central software bundle
`pc.2024.3.1.14` uploaded successfully from a local HTTP artifact source, and
the Prism Central VM deployment completed. After lab IPv6 dual-stack
remediation and a PE/PC redeploy, `RegisterToPc` registered the DEV_LAB Prism
Element cluster with Prism Central and ZTF verification returned
`Register_to_PC: PASS`. Raw lab addresses, credentials, screenshots, and job
logs remain outside the repository.

On 2026-07-24, the same lab also validated a low-risk Prism Element storage
container lifecycle through ZTF-Orchestrator job execution. `CreateContainerPe`
created a temporary RF1 validation container and returned `Create_container:
PASS`; `DeleteContainerPe` was first rejected without destructive-action
acknowledgement, then succeeded with the required confirmation and returned
`Delete_container: PASS`. A Prism Central category mutation was attempted as a
PC-backed object test, but Prism Central returned `503 SERVICE UNAVAILABLE`
from the v4 batch operations endpoint while category read calls succeeded. That
PC category mutation remains unvalidated and is tracked as a Prism Central
service-readiness limitation, not as proof of a credential or Orchestrator
submission failure.

Use [Sanitized UAT Evidence Record Pattern](sanitized-uat-evidence-record.md)
for non-NKP workflow evidence records. Use
[Foundation Central Validation Path](foundation-central-validation.md) for
cluster-create and imaging evidence, which is tracked separately from Prism
Central configuration.

## Locally Validated

The following areas have been validated with automated tests, local build
checks, static configuration checks, or local Docker checks:

| Area | Validation Evidence |
|---|---|
| Frontend | TypeScript and Vite production build pass. |
| APIs and backend logic | Flask/API test suite passes. |
| Authentication and RBAC | Login, sessions, logout, admin/operator/viewer restrictions, and protected routes are tested. |
| Config file management | Create, read, update, delete, backup, restore, path traversal rejection, extension validation, and oversized body handling are tested. |
| Workflow validation | Unknown workflow/script rejection, YAML validation, dry-run checks, and legacy `fc_ip` normalization are tested. |
| ZeroTouch Framework compatibility | Workflows 1.x and Scripts 1.x are validated against legacy ZTF 1.x semantics. Install, Docker, and appliance defaults keep the legacy lane on ZTF `v1.5.2` and bake a separate ZTF `v2.0.0` runtime for ZTF 2.x IaC, Workflows 2.x, and Scripts 2.x. ZTF 2.x checkouts are detected and blocked for legacy workflow/script launch because v2.0.0 has a different `ztf plan/apply` model. Apply/destroy submissions require a successful source plan job and approval-bound hashes. |
| Storage abstraction | File storage round-trip, concurrent file writes, and transient replace retry behavior are tested. PostgreSQL storage document/session/audit behavior is testable when `ZTF_TEST_DATABASE_URL` is supplied. |
| PostgreSQL backup controls | Admin-only backup list/create/download/restore endpoints, restore confirmation, safety-backup creation, restore maintenance locking, path rejection, and command secret handling are tested. |
| Docker Compose | Default PostgreSQL-backed compose and file-backed compose validate successfully. |
| Appliance kit | Appliance Compose file, first-boot scripts, cloud-init examples, and release packaging workflow are included. Local validation covers Compose rendering and script syntax only; QCOW2 image build and AHV import require infrastructure UAT. |
| Durable execution jobs | Job submission, persisted logs, estimated phase progress, execution history integration, cancellation, terminal job deletion controls, and interrupted-job recovery logic are implemented and tested. |
| Dashboard and health | `/health` reports runtime, storage backend, database location, retention, job queue counts, and NKP binary readiness. |
| NKP integration | Safe-phase install/update, template-aware profile packs, installed-example schema inference, example import, YAML preview/generation, profile validation, profile revisioning/restoration, execution trace metadata, approval-gated execution, task ID extraction, and NKP binary registration/upload flows are implemented and covered by repository-level tests. |
| Validation evidence | NKP evidence records, generic ZTF workflow UAT packs, and native Foundation review-packet evidence records are tested locally, including role-gated creation/list/download/delete behavior, generated or saved config capture, server-computed config hashes, readiness/schema metadata, redacted job output excerpts, native Foundation packet manifests, approval/phase-bound capture metadata, artifact hashes, approval binding from captured record IDs, and ZIP bundle export. |
| Pipelines | CRUD, viewer access, invalid workflows, empty steps, and streamed execution behavior are tested. |
| Schedules | Schedule validation and configured config directory behavior are tested. |
| Approvals | Create/approve/reject behavior, webhook integration, configurable mandatory workflow approval policy, direct-job approval enforcement, and automation-surface rejection for approval-mandatory workflows are tested. |
| Parallel execution | Submit flow and webhook adapter integration are tested. |
| Drift detection | Matched, changed, missing, unexpected, unknown, list, clear, and viewer restriction behavior are tested. |
| Native Foundation planning | Planning-only `native-foundation-deploy` phase catalog, intent validation, read-only discovery preview, live discovery contract manifests, discovery reconciliation manifests, deterministic plan/hash generation, execution readiness gates, image source manifests, node imaging plan payload previews, cluster formation plan payload previews, post-create validation payload previews, deployment type support review, network/IPAM manifests, secret reference manifests, secret resolution plans, secret-store binding reviews, secret-store provider contract reviews, secret lease execution reviews, secret audit persistence reviews, provider preflight manifests, execution graph planning, versioned adapter contract review, provider adapter scaffolding, adapter readiness reporting, deployment policy review, deployment wave gate review, deployment wave rehearsal planning, evidence pack approval review, deployment wave authorization review, deployment window reservation review, deployment scheduler review, execution admission review with execution authorization persistence admission completion-gate checks, execution adapter contract review with execution authorization persistence admission completion-gate metadata, execution request review with execution authorization persistence admission completion-gate metadata, execution request persistence admission review, dry-run execution ledger review, execution permit review, execution lock plan review, execution audit plan review, execution retention plan review, restart/resume review, backup/restore review, UAT evidence acceptance review, mutating enablement review, execution submission review with execution authorization persistence admission completion-gate metadata, execution submission persistence admission review, queue persistence review, queue persistence admission review, job persistence admission review, mutating adapter binding review, controlled UAT lane selection review, controlled UAT lane persistence admission review, controlled UAT hardware reservation review, controlled UAT reservation persistence admission review, controlled UAT entry issuance review, controlled UAT entry persistence admission review, controlled UAT start readiness review, controlled UAT start persistence admission review, controlled UAT runner admission review, controlled UAT runner persistence admission review, controlled UAT execution authorization review, controlled UAT completion review, execution authorization persistence admission review, runner readiness review, controlled UAT entry review, controlled UAT scope review, controlled UAT runbook review, controlled UAT security review, controlled UAT operations review, controlled UAT signoff review, recovery plan review, job state planning, durable review jobs, per-cluster evidence packs, resume checkpoint manifests, adapter promotion review, UAT checklist generation, adapter UAT rehearsal planning, adapter activation review, adapter enablement registry review, adapter allow-list review, adapter load plan review, adapter package provenance review, adapter SBOM review, adapter runtime isolation review, adapter runtime admission review, adapter execution preflight review, adapter target connectivity review, adapter credential handoff review, adapter command invocation review, adapter output evidence review, retained evidence export review, redacted review packet export with controlled UAT completion gate metadata and execution authorization persistence admission completion-gate counts, Validation Evidence capture with carried authorization-persistence, controlled UAT completion gate metadata, provider/topology matrix metadata, and execution authorization persistence admission completion-gate metadata, and approval binding review with execution authorization persistence admission completion-gate checks are implemented for sites, hardware providers, deployment types, cluster fields, node roles, role consistency, normalized manual/static facts, provider-specific discovery request/response contracts, intended-versus-discovered node fact matching, HCI/compute/storage/mixed formation previews, Prism Element/topology validation previews, provider/topology support records, site/cluster waves, deployment wave gates, deployment wave rehearsal packages, deployment wave authorization records, deployment window reservation records, deployment scheduler records, evidence pack approval records, future approval metadata, sanitized UAT evidence references, named credential references, future secret-store resolution requests, read-only secret binding records, secret-store provider contract records, secret lease execution records, secret audit event records, future adapter request envelopes with controlled UAT completion gate metadata, future execution request persistence admission records with controlled UAT completion and auth-persistence completion-gate summaries, future execution submission objects with controlled UAT completion and auth-persistence completion-gate summaries, execution submission records with controlled UAT completion and auth-persistence completion-gate summaries, future execution submission persistence admission records with controlled UAT completion gate summaries, queue persistence records with controlled UAT completion gate summaries, future queue persistence admission records with controlled UAT completion gate summaries, job persistence admission records with controlled UAT completion gate summaries, mutating adapter binding records with controlled UAT completion gate summaries, controlled UAT lane records with controlled UAT completion gate summaries, controlled UAT lane persistence admission records with controlled UAT completion gate summaries, controlled UAT hardware reservation records with controlled UAT completion gate summaries, controlled UAT reservation persistence admission records with controlled UAT completion gate summaries, controlled UAT entry issuance records with controlled UAT completion gate summaries, controlled UAT entry persistence admission records with controlled UAT completion gate summaries, controlled UAT start readiness records with controlled UAT completion gate summaries, controlled UAT start persistence admission records with controlled UAT completion gate summaries, controlled UAT runner admission records with controlled UAT completion gate summaries, controlled UAT runner persistence admission records with controlled UAT completion gate summaries, controlled UAT execution authorization records with controlled UAT completion gate summaries, controlled UAT completion records with controlled UAT completion gate summaries, execution authorization persistence admission records with controlled UAT completion gate summaries, step-level dry-run ledger entries, non-issued execution permit packages, unacquired lock requests, planned audit events, retention policy records, backup targets, restore rehearsal checks, restart replay records, backup/restore records, UAT evidence acceptance records, mutating enablement gate records, runner blocker records, controlled UAT entry blockers, controlled UAT scope records, controlled UAT runbook steps, controlled UAT security review items, controlled UAT operations review items, controlled UAT signoff review items, retention artifact names, stop/retry/rollback action previews, durable job state transitions, persisted review logs/history, provider/deployment UAT rehearsal cases, expected sanitized artifact names, activation request metadata, disabled registry draft entries with controlled UAT completion requirements, allow-list approval artifacts with controlled UAT completion requirements, adapter load plan entries with controlled UAT completion requirements, adapter package provenance entries with controlled UAT completion requirements, adapter SBOM review entries with controlled UAT completion requirements, adapter runtime isolation entries with controlled UAT completion requirements, adapter runtime admission entries with controlled UAT completion requirements, adapter execution preflight entries with controlled UAT completion requirements, adapter target connectivity entries with controlled UAT completion requirements, adapter credential handoff entries with controlled UAT completion requirements, adapter command invocation entries with controlled UAT completion requirements, adapter output evidence entries with controlled UAT completion requirements, retained evidence export items with controlled UAT completion requirements, site windows, max parallelism, wave blast-radius records, wave go/no-go controls, wave authorization records, window reservation records, scheduler queue records, topology support records, evidence pack go/no-go records, and failure policy. Mutating execution, live discovery, image staging, node imaging, cluster formation, live post-create validation, deployment type support enablement, mutating topology validation, execution admission start, native Foundation runner start, controlled UAT lane selection persistence, controlled UAT lane persistence admission, controlled UAT reservation persistence admission, controlled UAT hardware reservation persistence, controlled UAT hardware reservation, controlled UAT maintenance window opening, controlled UAT entry persistence admission, controlled UAT entry persistence, controlled UAT entry issuance, controlled UAT start persistence admission, controlled UAT start persistence, controlled UAT start, controlled UAT runner persistence admission, controlled UAT runner admission persistence, controlled UAT runner admission, execution authorization persistence admission, controlled UAT execution authorization persistence, controlled UAT execution authorization, controlled UAT completion persistence, controlled UAT completion, controlled UAT scope authorization, controlled UAT runbook approval, controlled UAT security approval, controlled UAT operations approval, controlled UAT signoff persistence, UAT evidence acceptance persistence, adapter promotion, production support certification, adapter loading, adapter activation, adapter binding persistence, adapter registry mutation, adapter allow-list persistence, adapter load plan persistence, adapter package reads, adapter package signature verification, adapter package staging, adapter SBOM generation, adapter SBOM reads, adapter vulnerability scanning, adapter sandbox creation, adapter runtime policy application, adapter process start, adapter runtime admission, adapter mutating job submission, adapter execution preflight, adapter target connectivity, socket opening, reachability probes, adapter credential handoff, adapter command invocation, command file writes, live command output capture, adapter output evidence persistence, retained adapter evidence export, adapter import, adapter instantiation, credential handoff to loaded adapters, permit issuance, lock acquisition, deployment window reservation, reservation persistence, scheduler persistence, wave opening, job enqueue, job submission, execution request persistence admission, execution request persistence, execution submission persistence admission, execution submission persistence, queue persistence, queue persistence admission, job persistence admission, job-state persistence, replay registration, window opening, audit persistence, retained evidence export, native Foundation backup/restore, checkpoint restore, restart replay, backup creation, restore execution, mutating execution enablement, dry-run adapter execution, mutating job submission, durable job persistence/replay, adapter UAT execution, recovery execution, secret-store binding, credential adapter handoff, secret-store provider approval, secret lease execution, secret audit persistence, lease opening, provider configuration persistence, and secret resolution remain disabled. |
| Audit/logging | Structured audit endpoint access and role restrictions are tested. |
| Security controls | Security headers, auth enforcement, allowlists, path traversal rejection, request size limit, and role checks are tested. |
| Live Nutanix CE lab scripts | `DeployPC`, `RegisterToPc`, `CreateContainerPe`, and `DeleteContainerPe` have been validated in a controlled single-node CE lab. PC v4 category mutation remains blocked by a Prism Central `503` on the batch operations endpoint. |
| Repository security assessment | Baseline source, dependency, auth/RBAC, storage, execution, and deployment review completed on 2026-06-05. |
| Version control | Release branch, `main`, and version tag workflow have been exercised through v1.3.0. |

## Requires Environment Validation

The following areas cannot be fully proven without the relevant infrastructure:

| Area | Required Environment |
|---|---|
| Nutanix workflow execution | Broader workflow coverage still requires Prism Central, Foundation Central, Prism Element, real credentials, safe test clusters/nodes, and approved workflow inputs beyond the validated DEV_LAB `DeployPC`, `RegisterToPc`, `CreateContainerPe`, and `DeleteContainerPe` paths. |
| Prism Central / Foundation Central connectivity | Prism Central and Prism Element connectivity have been validated in DEV_LAB for selected paths. Foundation Central connectivity and broader PC mutation services still require environment-specific validation. |
| PostgreSQL backup/restore drill | Safe UAT PostgreSQL service, backup storage, restore target, restart path, and recovery acceptance criteria. See [PostgreSQL Backup and Restore Drill](postgresql-backup-restore-drill.md). |
| Foundation Central cluster-create / imaging | Separate UAT Foundation Central validation for integrated `cluster-create`, `imaging-only`, and `imaging`, plus standalone FCA dry-run validation for `cluster-create-standalone-fca`, `imaging-only-standalone-fca`, `imaging-standalone-fca`, and `site-deploy-standalone-fca`; Prism Central config success does not validate this path. |
| Native Foundation execution adapters | Controlled UAT hardware, Foundation version, image source, BMC access, secret-store resolution, provider preflight, topology rules, stop/retry/rollback behavior, and post-run evidence are required before enabling imaging, cluster formation, live post-create validation, or recovery execution. |
| Kubernetes runtime | A real Kubernetes cluster, Docker Desktop Kubernetes, kind, minikube, or managed Kubernetes environment. |
| Load balancing and scaling | Multiple app instances, shared PostgreSQL backend, ingress or reverse proxy, and session/job behavior checks. |
| CDN/caching | A configured CDN or cache layer such as Cloudflare, Azure Front Door, nginx cache, or equivalent. |
| Full disaster recovery | Backup schedules, restore automation, outage simulation, recovery time objective, and recovery point objective. |
| External monitoring/error tracking | Monitoring stack such as Prometheus/Grafana, Sentry, ELK, Splunk, or equivalent. |

## Recommended UAT Plan

1. Local smoke test
   - Start with `docker compose up -d --build`.
   - Confirm `/health` returns healthy state.
   - Log in, check Dashboard state backend, submit a dry-run workflow, and review Jobs / Queue.

2. PostgreSQL backup and restore drill
   - Follow [PostgreSQL Backup and Restore Drill](postgresql-backup-restore-drill.md).
   - Record only the sanitized drill record and private evidence-store label.

3. Kubernetes deployment test
   - Apply the starter manifests in `k8s/`.
   - Confirm pod readiness/liveness probes.
   - Confirm PostgreSQL connectivity.
   - Confirm web login, health, and job submission.

4. Load-balancing test
   - Run multiple ZTF-Orchestrator instances behind a reverse proxy or ingress.
   - Confirm shared PostgreSQL state.
   - Submit jobs and verify behavior when requests are routed to different instances.
   - Confirm operational expectation for worker count and concurrency.

5. Nutanix lab workflow test
   - Validate credential references and connection profiles.
   - Run dry-run checks first.
   - Execute low-risk workflows against a controlled lab environment.
   - Record expected versus actual Prism Central, Foundation Central, and Prism Element changes.
   - Validate Foundation Central cluster-create and imaging separately from Prism Central configuration.

6. Disaster recovery exercise
   - Simulate application container loss.
   - Simulate PostgreSQL restore into a clean deployment.
   - Confirm interrupted jobs are marked correctly.
   - Confirm operators can resume from restored history/configuration.

## Validation Statement

ZTF-Orchestrator has been locally validated for application behavior, API
control flow, role enforcement, storage abstraction, PostgreSQL-backed state,
Docker Compose configuration, durable job execution, audit logging, and
configuration workflows. Full enterprise validation requires environment-specific
UAT against the target Nutanix infrastructure, PostgreSQL deployment,
Kubernetes/load-balancing model, and disaster recovery process.

ZTF 2.x support is intentionally tracked outside the legacy workflow lane in the
[ZTF 2.x Plan/Apply Roadmap](ztf-2x-plan-apply-roadmap.md). Current validation
covers runtime detection, job admission guards, YAML Studio shape checks,
Workflows 2.x, Scripts 2.x converted actions, demo visibility, and Docker
default bake validation. Live `ztf plan/apply` resource behavior still requires
environment-specific UAT against a reviewed ZeroTouch Framework 2.x checkout.
