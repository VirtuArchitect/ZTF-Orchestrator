# Native Foundation Secret References

Current release marker: `v1.8.0`.

The secret reference manifest records named credential references required for
future native Foundation provider adapters. It is read-only and does not resolve
or expose credential values.

## API

```text
POST /api/native-foundation/secrets/manifest
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>"
}
```

Valid intent returns `200` with a blocked manifest. Invalid intent returns
`400`. The endpoint is available to `admin`, `operator`, and `viewer` roles
because it only reviews metadata and never reads secrets.

## Intent Fields

Use named references such as:

- `provider_credential_ref`
- `api_credential_ref`
- `bmc_credential_ref`
- `credentials.provider`
- `credentials.api`
- `credentials.bmc`

Do not place passwords, API keys, tokens, or credential values directly in the
intent. Inline secret-like keys are reported by YAML path only; their values are
not returned.

## Provider Requirements

| Provider | Required reference before adapter promotion |
| --- | --- |
| `manual_static` | None for read-only planning |
| `nx` | Site-level `provider_credential_ref` or `api_credential_ref` |
| `cisco_intersight` | Site-level `provider_credential_ref` or `api_credential_ref` |
| `dell_idrac_redfish` | Site-level or node-level `bmc_credential_ref` |
| `hpe_ilo_redfish` | Site-level or node-level `bmc_credential_ref` |
| `lenovo_xcc_redfish` | Site-level or node-level `bmc_credential_ref` |

## Checks

| Check | Meaning |
| --- | --- |
| `credential-references-present` | Required references for selected providers are declared. |
| `inline-secrets-absent` | Intent does not contain inline secret-like fields. |
| `secret-values-not-resolved` | Review emits reference names only. |
| `secret-use-disabled` | Authentication and provider credential handoff remain disabled. |

## Boundary

This manifest does not authenticate to hardware providers, read a secret store,
decrypt credentials, or pass secrets to an adapter. Mutating use requires a
future secret-store integration with RBAC, audit logging, controlled hardware
UAT evidence, and updated support documentation.
