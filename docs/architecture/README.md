# ZTF-Orchestrator Architecture

Current release marker: `v1.7.6`.

This folder indexes the architecture documentation for ZTF-Orchestrator. The
goal is to keep the architecture, security boundary, data flow, and deployment
boundaries discoverable from one place while preserving the existing detailed
operator guides.

## Architecture Scope

ZTF-Orchestrator is the control plane and evidence layer between operators and
the underlying automation engines:

- ZeroTouch Framework 1.x remains the ZTF workflow/script execution engine.
- NKP ZeroTouch Framework remains the optional NKP automation engine.
- ZTF-Orchestrator owns UI workflow, RBAC, approvals, durable jobs, schedules,
  audit events, validation evidence, config management, and storage posture.
- Nutanix infrastructure remains the target system; production validation is
  environment-specific.

## Documents

| Document | Purpose |
|---|---|
| [SECURITY-BOUNDARY.md](SECURITY-BOUNDARY.md) | Trust boundary, sensitive inputs, and non-goals |
| [DATA-FLOW.md](DATA-FLOW.md) | Operator, API, storage, job, and target-system data flow |
| [DEPLOYMENT-BOUNDARIES.md](DEPLOYMENT-BOUNDARIES.md) | Deployment modes and operational limits |

## Related Existing Docs

- [Installation Guide](../installation-guide.md)
- [PostgreSQL Backend](../postgresql-backend.md)
- [Appliance Update Manager](../appliance-update-manager.md)
- [systemd Guide](../systemd.md)
- [nginx TLS Guide](../nginx-tls.md)
- [ZTF 2.x Plan/Apply Roadmap](../ztf-2x-plan-apply-roadmap.md)
