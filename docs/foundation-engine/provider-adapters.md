# Native Foundation Provider Adapters

Current release marker: `v1.8.0`.

Provider adapter manifest exposes the read-only interface ZTF-Orchestrator will
use for native Foundation hardware providers. It records controlled-UAT Dell
iDRAC Redfish discovery readiness plus planned operations for HPE iLO Redfish,
Lenovo XCC Redfish, NX, Cisco Intersight, and manual/static inventory. It does
not load adapter plugins, mount images, change boot order, power cycle hosts,
image nodes, or create clusters.

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

Non-Dell providers and node imaging remain blocked. Dell mutating operations
return `mutatingActionsEnabled: true` only when
`ZTF_NATIVE_FOUNDATION_ENABLE_DELL_IDRAC_DISCOVERY=true` and
`ZTF_NATIVE_FOUNDATION_ENABLE_DELL_IDRAC_MUTATION=true`.

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
jobs. The job path remains explicitly scoped to `dell_idrac_redfish` provider
intents and must not be treated as production enablement until hardware-side UAT
evidence is reviewed.

## Boundary

The manifest remains a controlled-UAT adapter contract. Broad production use or
additional provider mutation requires provider-specific code, controlled hardware
validation, approval binding, Validation Evidence, deployment policy review,
support matrix updates, runbook updates, and security review in the same change
set.
