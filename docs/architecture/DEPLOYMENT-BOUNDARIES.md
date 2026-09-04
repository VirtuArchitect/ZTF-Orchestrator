# Deployment Boundaries

Current release marker: `v1.8.1`.

ZTF-Orchestrator supports several deployment modes, but the operational boundary
depends on the environment, storage backend, network, and support model.

## Supported Modes

| Mode | Intended use | Boundary |
|---|---|---|
| Manual local | Development or workstation testing | File-backed state, local operator only |
| Docker Compose | Small-team server | PostgreSQL state and container lifecycle |
| AHV appliance | VM/appliance deployment | Appliance update, first-boot, and backup controls |
| Kubernetes starter | Cluster deployment starter | Requires platform-specific hardening |
| Air-gapped | Disconnected operations | Requires artifact, checksum, and transfer controls |

## Production-Assessment Requirements

- Named operators and role assignments.
- TLS/reverse proxy where network-exposed.
- PostgreSQL backup and restore drill.
- Disaster recovery objective and restore path.
- Runbooks for high-risk actions.
- UAT evidence for intended workflows.
- Target-side validation from Nutanix systems.
