# ZTF-Orchestrator Demo And Simulator

Current release marker: `v1.8.0`.

This folder separates demo and simulator evidence from live infrastructure
evidence. Simulator output is useful for local development and smoke testing,
but it must not be represented as production validation.

## Demo Boundary

- Hosted static UI demo:
  <https://virtuarchitect.github.io/ZTF-Orchestrator/>
- Demo and simulator paths are local or lab evidence.
- They can prove API shape, UI behavior, validation, and evidence packaging.
- They can show workflow config generation, import, preview, and guarded submit
  behavior in the browser.
- They do not prove live Prism Central, Prism Element, Foundation Central, or
  NKP deployment success.

## ZTF 2.x Demo Coverage

- **Settings > Runtime** shows ZTF 1.x legacy workflows and the separate ZTF
  2.x plan/apply runtime.
- **Setup & Install** includes a runtime selector for ZTF 1.x legacy and ZTF
  2.x IaC installation flows, with simulated install streams for both lanes.
- **Workflows 1.x** shows the legacy workflow catalog.
- **Workflows 2.x** shows ZTF 2.x workflow templates for category, project,
  subnet, image registration, VM deployment, security groups, protection
  policy, and recovery plan intents. Each template generates IaC files and
  submits simulated plan jobs from the workflow detail page.
- **Scripts 2.x** shows converted IaC actions for safe declarative script
  patterns: category, project, subnet, image, VM, security groups, protection
  policy, and recovery plan. Each action submits a simulated `ztf2:plan` job.
  Converted actions include Create Category, Create Project, Create Subnets,
  Upload Image, Create VMs, Create Security Groups, Create Protection Policy,
  and Create Recovery Plan.
- **ZTF 2.x IaC** queues simulated `ztf2:plan`, `ztf2:refresh`, `ztf2:apply`,
  and `ztf2:destroy` jobs.
- **YAML Studio** includes a ZTF 2.x `input.yml` template based on the
  `domains` model.
- **Jobs** and **Approvals** include simulated records showing a generated plan
  and an apply request bound to plan/input/global/state hashes.

These records demonstrate UI and governance behavior only. They are not live
ZeroTouch Framework 2.x or Nutanix infrastructure validation.

## Documents

| Document | Purpose |
|---|---|
| [PRISM-CENTRAL-SIMULATOR.md](PRISM-CENTRAL-SIMULATOR.md) | Simulator usage and evidence boundary |

## Related Existing Docs

- [Prism Central Simulator](../prism-central-simulator.md)
- [Sanitized UAT Evidence Record Pattern](../sanitized-uat-evidence-record.md)
- [Validation Status](../validation-status.md)
