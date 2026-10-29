# Disaster Recovery setup screenshot provenance

Captured 29 October 2026 from the actual React interface at source commit
`867fe83f6c90dff1ee785e8caf0fe2b82b969174` for **v1.8.5-rc1**.
The light-theme screenshots use generic simulated API records in a separate,
in-memory browser session. They are not screenshots of a production installation.

- `01-add-datacenter.png`: Add Datacenter form, generic endpoint and prerequisite
  reviews left outstanding.
- `02-linked-profile.png`: profile linked to saved Foundation VM YAML and a saved
  two-step post-configuration pipeline.
- `03-reviewed-baseline.png`: simulated reviewed revision with cluster identity,
  physical targets, deployment excerpt, pipeline snapshots and planning notes.

The capture intercepted all API calls. Only datacenter save, draft profile save
and baseline review were simulated. No live backend was used. No preparation,
deployment, rehearsal or pipeline execution endpoint was requested. External
font requests were blocked. No Foundation VM or Prism system was contacted.

The illustrated YAML is abbreviated and must not be copied as a complete runnable
configuration. A reviewed baseline is distinct from dependency readiness and
deployment approval. The images do not establish backend persistence, appliance
activation, physical recovery success, vendor certification or production readiness.

The [illustrated setup procedure](../../../disaster-recovery-setup.md) links
these screenshots to the operator steps. [Asset checksums](SHA256SUMS) cover the
three images and the published Word and PDF editions.
