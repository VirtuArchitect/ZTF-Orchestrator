# Native Foundation Provider Preflight

Current release marker: `v1.8.0`.

Provider preflight composes the native Foundation plan, provider adapter
manifest, image manifest, network manifest, and secret reference manifest into a
per-site readiness view for future live discovery UAT.

## API

```text
POST /api/native-foundation/provider-preflight
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>"
}
```

Valid intent returns `200` with a blocked read-only preflight manifest. Invalid
intent returns `400`.

## What It Reviews

- Provider contract registration.
- Required provider or BMC credential reference names.
- Inline secret-like YAML paths.
- Declared BMC addresses for provider discovery.
- Availability of image, network, secret reference, and provider adapter
  manifests.

## What It Does Not Do

Provider preflight does not authenticate to providers, call Redfish, call NX,
call Cisco Intersight, power-cycle hardware, mount virtual media, image nodes,
or form clusters.

## Checks

| Check | Meaning |
| --- | --- |
| `provider-contract-known` | Site provider has a registered read-only contract. |
| `credential-references-present` | Required provider credential references are present. |
| `inline-secrets-absent` | No inline password, token, API key, secret, or credential fields are present. |
| `bmc-addresses-declared` | Provider nodes have declared BMC addresses before live discovery UAT. |
| `live-discovery-disabled` | Live provider discovery remains disabled. |
| `mutating-provider-operations-disabled` | Power, boot, media, imaging, and cluster-create operations remain disabled. |

## Promotion Boundary

A passing metadata preflight is necessary but not sufficient for execution.
Future live discovery must be promoted one provider at a time with RBAC,
auditing, secret-store resolution, rollback controls, controlled hardware UAT,
and updated support documentation.
