# ZTF-Orchestrator Architecture

Current release marker: `v1.8.5-rc1` (prerelease; production deployment use reported separately).

This folder indexes the architecture documentation for ZTF-Orchestrator. The
goal is to keep the architecture, security boundary, data flow, and deployment
boundaries discoverable from one place while preserving the existing detailed
operator guides.

## Architecture Scope

ZTF-Orchestrator is the control plane and evidence layer between operators and
the underlying automation engines:

- ZeroTouch Framework 1.x remains the ZTF workflow/script execution engine.
- NKP and ZTF 2.x console setup and execution are retired; saved records and baked runtimes are retained separately.
- Native Foundation Deploy remains a dedicated workflow with planning/review APIs and a separately gated controlled-UAT adapter path. It is distinct from the retired Native pipeline executor option. Adapter availability and hardware validation must be established for the exact target; planning reviews do not enable mutation.
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
| [native-foundation-engine.md](native-foundation-engine.md) | Native Foundation architecture, controlled-UAT adapter path, and phase boundary |
| [../foundation-engine/dell-xc770-hci-deployment-requirements.md](../foundation-engine/dell-xc770-hci-deployment-requirements.md) | Requirements and evidence boundary for Dell XC770 AHV HCI deployment |

## Related Existing Docs

- [Installation Guide](../installation-guide.md)
- [PostgreSQL Backend](../postgresql-backend.md)
- [Appliance Update Manager](../appliance-update-manager.md)
- [systemd Guide](../systemd.md)
- [nginx TLS Guide](../nginx-tls.md)
- [ZTF 2.x Plan/Apply Roadmap](../ztf-2x-plan-apply-roadmap.md)
- [Native Foundation Engine Roadmap](../foundation-engine-roadmap.md)
- [Native Foundation Phase Catalog](../foundation-engine/phase-catalog.md)
