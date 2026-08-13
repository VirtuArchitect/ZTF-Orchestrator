# Security Boundary

Current release marker: `v1.7.3`.

ZTF-Orchestrator is an internal operator console for controlled automation. It
is not a public internet service, a Nutanix-supported product, or a replacement
for Prism Central, Foundation Central, NCC, enterprise identity, backup, or
incident-response controls.

## In Boundary

- Local application authentication and role checks.
- Workflow/script allowlists.
- Approval-gated execution paths.
- Durable job queue state and persisted logs.
- Config file storage and YAML Studio export behavior.
- PostgreSQL-backed users, sessions, approvals, jobs, evidence, schedules, and
  audit events.
- Appliance update request staging and offline package verification.
- Validation evidence export for UAT and handoff.

## Out Of Boundary

- Vendor support for Nutanix infrastructure.
- Broad production validation without environment-specific UAT.
- Internet exposure without reverse proxy, TLS, and hardening.
- Uncontrolled NKP apply, upgrade, registry push, or destroy actions.
- Native ZTF 2.x plan/apply execution in the current workflow launcher.
- Direct infrastructure mutation from YAML Studio.

## Sensitive Inputs

- Prism Central, Prism Element, Foundation Central, registry, and NKP
  credentials.
- Generated YAML and config files.
- Approval records and audit events.
- PostgreSQL backup files.
- Offline update packages and image tars.

## Required Companion Controls

- [Security Assessment](../security/SECURITY_ASSESSMENT.md)
- [Production Readiness Boundary](../governance/PRODUCTION-READINESS-BOUNDARY.md)
- [Disaster Recovery](../governance/DISASTER-RECOVERY.md)
- [Runbook Control Matrix](../runbooks/README.md)
