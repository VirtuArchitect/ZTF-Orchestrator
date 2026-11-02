# Current Administrator and User Guide Screenshots

Application version: **v1.8.5-rc1**. Source revision:
`a3c9c79832efe4552cab5b208d5fbe49936dcbf8` is the application baseline.
The capture also includes this revision's demo-only file-metadata and audit-date corrections.
Capture date: **2 November 2026**.

All 52 images show the frontend with **simulated demo data**. No live
PE, PC, Foundation or appliance was contacted. Demo identities, inventories,
jobs and readiness results do not establish UAT completion or target health.

Users, Sessions, revocation confirmation and deployment guidance were refreshed
for administrator session management and the Foundation VM implementation label.
Their per-image provenance and checksums are recorded in `capture-manifest.json`;
other captures retain their earlier baseline. Session revocation in the demo
changes only synthetic browser-memory records and cannot revoke a live sign-in.

Viewport: 1600 x 1050; light theme; UTC; en-GB. Some form captures scroll the
main content to expose lower inputs. The classic installer form is populated
with the documentation-only `http://foundation.example.com:8000` endpoint.
No historical image was relabelled.

## Reproduce

```sh
npm run build:demo
npm run preview -- --mode demo --host 127.0.0.1 --port 15187 --strictPort
# In another terminal:
node scripts/capture_guide_screenshots.cjs
```

The capture helper allows loopback static-demo origins only and blocks backend
API and external requests. It asserts the demo disclaimer and frontend release
before every capture, and fails on browser errors. It does not run deployments.

## Screen index

| Screen | Capture |
|---|---|
| About | [PNG](about.png) |
| Appliance | [PNG](appliance.png) |
| Approvals | [PNG](approvals.png) |
| Audit Log | [PNG](audit-log.png) |
| Configs | [PNG](configs.png) |
| Configure Cluster | [PNG](configure-cluster.png) |
| Connections | [PNG](connections.png) |
| Credential Rotation | [PNG](credential-rotation.png) |
| Dashboard | [PNG](dashboard.png) |
| Deployment Guide | [PNG](deployment-guide.png) |
| Drift Edit | [PNG](drift-edit.png) |
| Drift | [PNG](drift.png) |
| Executions | [PNG](executions.png) |
| First Boot | [PNG](first-boot.png) |
| Foundation Images | [PNG](foundation-images.png) |
| Foundation Nodes | [PNG](foundation-nodes.png) |
| Foundation Vm | [PNG](foundation-vm.png) |
| Global Config | [PNG](global-config.png) |
| Governance | [PNG](governance.png) |
| Jobs | [PNG](jobs.png) |
| Native Foundation | [PNG](native-foundation.png) |
| Nkp Readiness | [PNG](nkp-readiness.png) |
| Nkp | [PNG](nkp.png) |
| Notifications | [PNG](notifications.png) |
| Parallel | [PNG](parallel.png) |
| Pipelines | [PNG](pipelines.png) |
| Post Configuration | [PNG](post-configuration.png) |
| Schedules | [PNG](schedules.png) |
| Scripts 2X | [PNG](scripts-2x.png) |
| Scripts | [PNG](scripts.png) |
| Sessions | [PNG](sessions.png) |
| Session revocation confirmation | [PNG](session-revocation.png) |
| Settings | [PNG](settings.png) |
| Setup | [PNG](setup.png) |
| Start Here | [PNG](start-here.png) |
| Config groups | [PNG](config-groups.png) |
| Pipeline config groups | [PNG](pipeline-config-groups.png) |
| PE login title | [PNG](pe-login-title.png) |
| Update progress | [PNG](update-progress.png) |
| Storage | [PNG](storage.png) |
| Updates | [PNG](updates.png) |
| Upgrade Advisor | [PNG](upgrade-advisor.png) |
| Users | [PNG](users.png) |
| Validation Evidence | [PNG](validation-evidence.png) |
| Workflows 2X | [PNG](workflows-2x.png) |
| Workflows | [PNG](workflows.png) |
| Yaml Studio | [PNG](yaml-studio.png) |
| Ztf Modes | [PNG](ztf-modes.png) |
| Ztf2 Iac | [PNG](ztf2-iac.png) |

- [Monitor & Verify](monitor-verify.png)
- [Clusters](clusters.png)
- [Disaster Recovery](disaster-recovery.png)

[Capture manifest and SHA256 hashes](capture-manifest.json).

Current grouping, scoped selection, PE title and progress illustrations use the
latest implemented UI with generic simulated fixtures. Supplement captures can
be reproduced with `node scripts/capture_current_operational_supplements.cjs`
after serving the local static demo on port 15221. See `capture-manifest.json`
and `SHA256SUMS` for per-image provenance.
