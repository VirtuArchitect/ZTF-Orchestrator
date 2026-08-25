# Production Readiness Boundary

Current release marker: `v1.7.10`.

ZTF-Orchestrator can be operated in a controlled UAT posture when procedures,
approvals, backups, evidence capture, and recovery paths are in place. It
should not be described as broadly production validated without
environment-specific proof.

## Valid Claims

- Internal operations console for guided ZTF 1.x workflows and safe NKP
  deployment preparation.
- RBAC, approvals, durable jobs, schedules, audit history, drift checks,
  validation evidence, YAML Studio, and appliance update surfaces are present.
- YAML Studio is non-mutating.
- Current workflow/script execution targets the legacy ZTF 1.x CLI.

## Claims Requiring More Evidence

- Foundation Central create/imaging production execution.
- Full NKP deployment lifecycle execution.
- Production disaster recovery under agreed RPO/RTO.
- External exposure and enterprise identity assurance.
- Nutanix-supported product status.

## Evidence Categories

| Category | Meaning | Production claim allowed |
|---|---|---|
| Local test | Unit/integration/build proof | No |
| Simulator | API-shaped local simulation | No |
| DEV_LAB | Controlled lab proof | Lab-scoped only |
| Controlled UAT | Approved representative environment proof | Scenario-scoped |
| Production validation | Accepted production-like target proof | Scope-specific |

The prior root-level [Production Readiness Boundary](../production-readiness-boundary.md)
is retained for compatibility; this folder is the canonical governance index.
