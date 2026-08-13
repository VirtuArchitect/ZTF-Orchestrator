# Production Readiness Boundary

Current release marker: `v1.7.3`.

This document prevents overclaiming. ZTF-Orchestrator can be operated in a
controlled UAT posture when documented procedures and evidence exist, but broad
production validation is environment-specific and must be proven separately.

## Valid Claims

It is reasonable to say:

- ZTF-Orchestrator is an internal operations console for guided ZeroTouch
  Framework 1.x workflows and safe NKP deployment preparation.
- The application provides RBAC, approvals, durable jobs, schedules, audit
  history, drift checks, validation evidence, YAML Studio, and appliance update
  surfaces.
- YAML Studio is non-mutating.
- Current workflow/script execution targets the legacy ZTF 1.x CLI.
- Operator controlled/UAT-ready use requires runbooks, backups, approvals,
  validation, evidence capture, and recovery paths.

## Claims That Require More Evidence

Do not claim broadly production-validated status until evidence exists for the
specific deployment, target environment, and workflows. The following require
environment-specific proof:

- Foundation Central create/imaging production execution.
- Prism Central or Prism Element mutations beyond already evidenced lab paths.
- Full NKP deployment lifecycle execution.
- Disaster recovery under real operational recovery objectives.
- Security assurance beyond repository review and configured deployment
  hardening.
- External exposure, multi-team tenancy, or enterprise identity integration.

## Evidence Categories

| Category | Meaning | Production Claim Allowed |
|---|---|---|
| Local unit/integration test | Code behavior in local test harness | No |
| Frontend/build check | UI/build integrity | No |
| Simulator proof | API-shaped local simulation | No |
| DEV_LAB proof | Lab target validation | Lab-scoped only |
| Controlled UAT | Approved scenario in representative environment | Scenario-scoped only |
| Production validation | Approved production-like run with target evidence | Scope-specific |

## Unsupported or Out-of-Scope Areas

- Internet exposure without reverse proxy, TLS, and environment hardening.
- Uncontrolled destructive NKP actions.
- Native ZTF 2.x `plan/apply` mode for current workflow execution.
- Direct infrastructure mutation from YAML Studio.
- Claims that this project is supported by Nutanix.

## Required Before Stronger Production Positioning

- Complete P1 runbooks in `docs/runbooks/`.
- Controlled UAT evidence packages for intended workflows.
- Backup and restore drill for the deployment mode.
- Failed-job recovery evidence.
- Emergency stop exercise.
- Security review for the deployed environment.
- Clear owner for operating, approving, and recovering the platform.

## Review Cadence

Review this boundary before every release, after major workflow additions, and
after any incident, failed job, restore, or security-sensitive change.
