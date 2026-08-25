# Evidence Mapping

Current release marker: `v1.7.8`.

Use this mapping to connect operational claims to evidence sources.

| Claim | Minimum evidence |
|---|---|
| App starts and serves UI | `/health`, login, dashboard load |
| Storage backend is recoverable | Backup, restore drill, post-restore validation |
| Workflow execution is controlled | Config hash, approval, job ID, audit event |
| Failed job recovery is governed | Failed job log, target-state assessment, recovery decision |
| NKP safe phase is controlled | Profile revision, generated YAML, approval, job output |
| Air-gapped update is controlled | Package manifest, checksums, transfer record, health result |
| Security posture is reviewed | Security assessment, dependency audit, deployment hardening notes |
| Production validation is scoped | Target-side evidence and accepted UAT/production record |
