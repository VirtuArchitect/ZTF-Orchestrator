# Native Foundation Provider Adapters

Current release marker: `v1.8.4`.

Provider adapter manifest exposes the interface ZTF-Orchestrator uses for
native Foundation hardware providers. It records controlled-UAT Dell iDRAC
Redfish discovery readiness, the real-adapter command readiness gate, and
planned operations for HPE iLO Redfish, Lenovo XCC Redfish, NX, Cisco
Intersight, and manual/static inventory. Non-Dell providers remain non-mutating
planning targets.

## API

```text
GET /api/native-foundation/provider-adapters
POST /api/native-foundation/provider-adapters
POST /api/native-foundation/providers/dell-idrac/redfish-probe
```

`GET` returns the full read-only provider scaffold. `POST` accepts a
`native-foundation-deploy` intent and scopes the returned adapter manifest to
the providers declared by that intent.

For site/cluster-specific operation planning, use
`POST /api/native-foundation/provider-operation-catalog`. That catalog expands
these provider operations together with deployment-type operations such as HCI
cluster create, compute registration, storage-only formation, and post-create
validation without enabling execution.

Request body for `POST`:

```json
{
  "content": "<native-foundation-deploy YAML>"
}
```

## Operation Scaffold

Each provider reports these operations:

| Operation | Mutating | Current status |
|---|---|---|
| `discover_inventory` | No | Implemented read-only for `manual_static` and controlled-UAT read-only for `dell_idrac_redfish`; planned for other hardware/API providers. |
| `power_control` | Yes | Controlled-UAT enabled for Dell iDRAC only when both Dell UAT env gates are true; otherwise blocked. |
| `boot_order` | Yes | Controlled-UAT enabled for Dell iDRAC only when both Dell UAT env gates are true; otherwise blocked. |
| `image_mount` | Yes | Controlled-UAT enabled for Dell iDRAC only when both Dell UAT env gates are true; otherwise blocked. |
| `image_nodes` | Yes | Blocked. |

Non-Dell providers remain blocked. Dell mutating operations return
`mutatingActionsEnabled: true` only when
`ZTF_NATIVE_FOUNDATION_ENABLE_DELL_IDRAC_DISCOVERY=true` and
`ZTF_NATIVE_FOUNDATION_ENABLE_DELL_IDRAC_MUTATION=true`. Actual AHV mounting,
AOS deployment, HCI cluster formation, Foundation log capture, and Prism
Element post-create validation also require
`ZTF_NATIVE_FOUNDATION_ENABLE_REAL_DEPLOYMENT_ADAPTER=true` and
`ZTF_NATIVE_FOUNDATION_ADAPTER_COMMAND` pointing to a reviewed local Foundation
deployment adapter executable. The Docker/appliance image includes
`/app/scripts/native_foundation_ztf_site_deploy_adapter.py`, which translates
Native Foundation Dell HCI intent into the embedded ZTF 1.x Foundation Central
`site-deploy` workflow. A typical appliance command binding is:

```text
ZTF_NATIVE_FOUNDATION_ENABLE_REAL_DEPLOYMENT_ADAPTER=true
ZTF_NATIVE_FOUNDATION_ADAPTER_COMMAND=/opt/ztf-python/bin/python
ZTF_NATIVE_FOUNDATION_ADAPTER_ARGS=/app/scripts/native_foundation_ztf_site_deploy_adapter.py
```

The provider manifest exposes `fullDeploymentReady` and
`canRunFullDeployment` separately from `mutatingActionsEnabled`. The UI should
only show the Native Foundation Deploy path as runnable when the Dell UAT gates
are enabled and the real deployment adapter command resolves to an installed
executable.

## Dell iDRAC Redfish Probe

`POST /api/native-foundation/providers/dell-idrac/redfish-probe` validates a
Dell iDRAC Redfish target against the current native Foundation intent. It uses
the first `dell_idrac_redfish` site/node target unless `bmcAddress` is supplied
in the request body, and it uses `credentialRef` or the declared
`bmc_credential_ref` without returning credential values.

Live probing is disabled unless
`ZTF_NATIVE_FOUNDATION_ENABLE_DELL_IDRAC_DISCOVERY=true` is set in the runtime
environment. When enabled, the probe performs a read-only `GET` against
`/redfish/v1/` and records the Redfish service-root metadata needed for
controlled UAT evidence.

`ZTF_NATIVE_FOUNDATION_ENABLE_DELL_IDRAC_MUTATION=true`, together with the live
discovery gate, enables Dell-only native Foundation controlled-UAT deployment
job admission. The deployment job then probes every declared iDRAC, validates
image sources, writes an adapter request/evidence directory, invokes the
configured real adapter command, and checks Prism Element after the adapter
returns success. The job path remains explicitly scoped to `dell_idrac_redfish`
provider intents and must not be treated as production enablement until
hardware-side UAT evidence is reviewed.

## Boundary

The manifest remains a controlled-UAT adapter contract. Broad production use or
additional provider mutation requires provider-specific code, controlled hardware
validation, approval binding, Validation Evidence, deployment policy review,
support matrix updates, runbook updates, and security review in the same change
set.
