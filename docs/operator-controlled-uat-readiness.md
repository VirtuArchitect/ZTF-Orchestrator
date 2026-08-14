# Operator Controlled UAT Readiness

Current release marker: `v1.7.6`.

This document defines the minimum documentation and operating posture required
to describe a ZTF-Orchestrator deployment as operator controlled/UAT-ready.

Operator controlled/UAT-ready does not mean broadly production validated. It
means a named operator can run approved scenarios in a controlled environment
with documented prerequisites, approvals, backups, execution records, evidence,
and recovery paths.

## Required Operating Posture

- Named admin, operator, and viewer accounts are configured.
- Administrative access is limited to users who need it.
- Storage backend is known and visible in the UI.
- PostgreSQL-backed deployments have backup and restore procedures.
- ZTF path, Python runtime, config directory, and optional NKP path are
  configured.
- The deployment has a current version and source/release reference.
- Schedules, approvals, jobs, audit log, and validation evidence are understood
  by the operators.
- P1 runbooks in `docs/runbooks/` are available to operators.

## Required UAT Scenarios

At minimum, controlled UAT should cover:

1. Application start/restart and health validation.
2. Login with admin, operator, and viewer roles.
3. Config/YAML generation or upload.
4. Server-side YAML/config validation.
5. Approval request and approval decision for a controlled workflow.
6. Durable job submission in a safe or lab target scenario.
7. Failed-job triage using a non-destructive failure case.
8. Validation evidence creation/export.
9. PostgreSQL backup creation.
10. Restore drill in a disposable or approved recovery environment.
11. Upgrade or staged update validation.
12. Emergency stop simulation for queued or running work.

## Required Evidence

Use [UAT Evidence Checklist](uat-evidence-checklist.md) for the evidence format.
Each UAT scenario should capture:

- app version and source reference;
- operator and approver where applicable;
- config/profile/package hash;
- job ID and terminal state;
- validation result;
- relevant audit events;
- target-side confirmation or explicit simulator/lab boundary;
- recovery or rollback decision when a failure occurs.

## Known Boundaries

- ZTF-Orchestrator targets the legacy ZeroTouch Framework 1.x workflow/script
  CLI for current execution paths.
- ZTF 2.x plan/apply support is a future separate mode, not a drop-in
  replacement for the current workflow catalog.
- YAML Studio generates, validates, saves, and exports YAML. It does not execute
  workflows or mutate Nutanix infrastructure.
- NKP integration is constrained to exposed safe phases; blocked phases remain
  blocked server-side.
- DEV_LAB, simulator, and local checks are useful evidence but do not prove
  broad production readiness.

## Exit Criteria

A deployment can be called operator controlled/UAT-ready when:

- P1 runbooks are reviewed and accessible;
- the UAT scenarios above have passed or have documented exceptions;
- evidence packages are stored with the change/UAT record;
- backup and restore behavior is proven for the deployment mode;
- failed-job recovery and emergency stop paths are rehearsed;
- remaining production-readiness gaps are listed in
  [Production Readiness Boundary](production-readiness-boundary.md).
