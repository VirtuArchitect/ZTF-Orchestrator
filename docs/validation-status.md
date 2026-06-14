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
| Storage abstraction | File storage round-trip is tested. PostgreSQL storage document/session/audit behavior is testable when `ZTF_TEST_DATABASE_URL` is supplied. |
| PostgreSQL backup controls | Admin-only backup list/create/download endpoints, path rejection, and command secret handling are tested. |
| Docker Compose | Default PostgreSQL-backed compose and file-backed compose validate successfully. |
| Appliance kit | Appliance Compose file, first-boot scripts, cloud-init examples, and release packaging workflow are included. Local validation covers Compose rendering and script syntax only; QCOW2 image build and AHV import require infrastructure UAT. |
| Durable execution jobs | Job submission, persisted logs, estimated phase progress, execution history integration, cancellation, terminal job deletion controls, and interrupted-job recovery logic are implemented and tested. |
| Dashboard and health | `/health` reports runtime, storage backend, database location, retention, job queue counts, and NKP binary readiness. |
| NKP integration | Safe-phase install/update, template-aware profile packs, installed-example schema inference, example import, YAML preview/generation, profile validation, profile revisioning/restoration, execution trace metadata, approval-gated execution, task ID extraction, and NKP binary registration/upload flows are implemented and covered by repository-level tests. |
| Validation evidence | NKP evidence records, role-gated creation/list/download/delete behavior, generated YAML capture, readiness/schema metadata, and ZIP bundle export are tested locally. |
| Pipelines | CRUD, viewer access, invalid workflows, empty steps, and streamed execution behavior are tested. |
| Schedules | Schedule validation and configured config directory behavior are tested. |
| Approvals | Create/approve/reject behavior and webhook integration are tested. |
| Parallel execution | Submit flow and webhook adapter integration are tested. |
| Drift detection | Matched, changed, missing, unexpected, unknown, list, clear, and viewer restriction behavior are tested. |
| Audit/logging | Structured audit endpoint access and role restrictions are tested. |
| Security controls | Security headers, auth enforcement, allowlists, path traversal rejection, request size limit, and role checks are tested. |
| Repository security assessment | Baseline source, dependency, auth/RBAC, storage, execution, and deployment review completed on 2026-06-05. |
| Version control | Release branch, `main`, and version tag workflow have been exercised through v1.2.9. |

## Requires Environment Validation

The following areas cannot be fully proven without the relevant infrastructure:

| Area | Required Environment |
|---|---|
| Nutanix workflow execution | Prism Central, Foundation Central, Prism Element, real credentials, safe test clusters/nodes, and approved workflow inputs. |
| Prism Central / Foundation Central connectivity | Reachable Nutanix endpoints on required ports, valid service accounts, and representative network paths. |
| Production PostgreSQL backup/restore | Target production or staging PostgreSQL service, backup storage, restore target, and recovery acceptance criteria. |
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
   - Create test users, config files, jobs, schedules, approvals, and drift records.
   - Back up the PostgreSQL database or Docker volume.
   - Restore into a clean environment.
   - Confirm state, sessions, history, jobs, and audit events are present.

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
