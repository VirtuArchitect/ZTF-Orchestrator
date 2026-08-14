# ZTF-Orchestrator Runbooks

Current release marker: `v1.7.4`.

This directory contains operational runbooks for controlled ZTF-Orchestrator
use. The runbooks are intended for internal operators who run allowlisted
ZeroTouch Framework workflows, safe NKP phases, appliance updates, backups,
restore actions, and incident response in a governed environment.

ZTF-Orchestrator is an unofficial community project and is not affiliated with
or supported by Nutanix. These runbooks are project operator guidance, not
Nutanix-mandated procedures.

## Operator Controlled/UAT-Ready Boundary

The runbook set supports an operator controlled/UAT-ready posture. That means:

- the application is operated by named users with role-based access;
- changes are submitted through documented workflows, approvals, and jobs;
- PostgreSQL or file-backed operational state is backed up before high-risk
  actions;
- operators capture evidence from validation, job output, audit events, and
  target-side checks;
- failed jobs are triaged before rerun, because infrastructure workflows may
  have partially completed;
- production validation remains environment-specific and must be evidenced
  separately.

See:

- [Operator Controlled UAT Readiness](../operator-controlled-uat-readiness.md)
- [UAT Evidence Checklist](../uat-evidence-checklist.md)
- [Production Readiness Boundary](../production-readiness-boundary.md)

## Runbook Control Matrix

| ID | Operation | Risk | Approval | Rollback | Evidence | Status |
|---|---|---:|---|---|---|---|
| [RB-001](RB-001-start-stop-restart.md) | Start, stop, restart | Low | No | Yes | Log/health | Approved |
| [RB-002](RB-002-backup-restore.md) | Backup and restore | High | Yes for restore | Required | Required | Approved |
| [RB-003](RB-003-upgrade-rollback.md) | Upgrade and rollback | High | Yes | Required | Required | Approved |
| [RB-004](RB-004-ztf-workflow-execution.md) | ZTF workflow execution | High | Conditional | Required | Required | Approved |
| [RB-005](RB-005-failed-job-recovery.md) | Failed job recovery | High | Conditional | N/A | Required | Approved |
| [RB-006](RB-006-emergency-stop.md) | Emergency stop | Critical | Notify approver | N/A | Required | Approved |
| [RB-007](RB-007-airgapped-update.md) | Air-gapped update | Medium | Yes | Required | Required | Draft |
| [RB-008](RB-008-nkp-safe-phase-execution.md) | NKP safe phase execution | High | Yes | Required | Required | Draft |
| [RB-009](RB-009-user-rbac-management.md) | User and RBAC management | Medium | Yes for admin changes | Yes | Audit | Draft |
| [RB-010](RB-010-database-recovery.md) | Database recovery | Critical | Yes | Safety backup | Required | Draft |
| [RB-011](RB-011-security-incident.md) | Security incident | Critical | Escalate | N/A | Required | Draft |
| [RB-012](RB-012-decommission.md) | Decommission | High | Yes | Archive evidence | Required | Draft |

## Standard Runbook Format

Each runbook uses the same structure:

1. Metadata
2. Purpose
3. Scope
4. Preconditions
5. Required role/RBAC
6. Required inputs
7. Dependencies
8. Risk/impact
9. Procedure
10. Validation
11. Expected result
12. Failure conditions
13. Recovery/rollback
14. Evidence to capture
15. Audit requirements
16. Escalation
17. References
18. Evidence mapping

Use [RUNBOOK-TEMPLATE.md](RUNBOOK-TEMPLATE.md) when adding new runbooks.
