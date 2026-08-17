# ZTF-Orchestrator Demo And Simulator

Current release marker: `v1.7.7`.

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

## Documents

| Document | Purpose |
|---|---|
| [PRISM-CENTRAL-SIMULATOR.md](PRISM-CENTRAL-SIMULATOR.md) | Simulator usage and evidence boundary |

## Related Existing Docs

- [Prism Central Simulator](../prism-central-simulator.md)
- [Sanitized UAT Evidence Record Pattern](../sanitized-uat-evidence-record.md)
- [Validation Status](../validation-status.md)
