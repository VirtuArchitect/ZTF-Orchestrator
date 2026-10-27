# Current Administrator and User Guide Screenshots

Application version: **v1.8.5-rc1**. Source revision:
`4a010727d5db3496d17a52e4ce681818dcc56200` is the application baseline.
This documentation revision also aligns simulated build metadata with APP_VERSION.
Capture date: **27 October 2026**.

All 43 images show the current frontend with **simulated demo data**. No live
PE, PC, Foundation or appliance was contacted. Demo identities, inventories,
jobs and readiness results do not establish UAT completion or target health.

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
| Settings | [PNG](settings.png) |
| Setup | [PNG](setup.png) |
| Start Here | [PNG](start-here.png) |
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
