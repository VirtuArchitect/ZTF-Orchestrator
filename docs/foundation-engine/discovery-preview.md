# Native Foundation Discovery Preview

Current release marker: `v1.8.0`.

Discovery preview is the first read-only native Foundation engine capability.
It converts a `native-foundation-deploy` intent into normalized site, cluster,
and node facts without contacting BMCs, changing power state, altering boot
configuration, imaging nodes, or creating clusters.

## API

```text
POST /api/native-foundation/discovery/preview
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>"
}
```

Response shape:

```json
{
  "readOnly": true,
  "mutatingActionsEnabled": false,
  "status": "valid",
  "passed": 24,
  "failed": 0,
  "providers": ["manual_static"],
  "sites": [],
  "warnings": []
}
```

The endpoint accepts admin, operator, and viewer roles because it does not
mutate infrastructure.

## Provider Behavior

| Provider | Discovery Mode | Behavior |
|---|---|---|
| `manual_static` | `manual_static` | Normalizes facts from the submitted intent. |
| `nx` | `adapter_planned` | Validates shape only; live discovery is not enabled. |
| `cisco_intersight` | `adapter_planned` | Validates shape only; live discovery is not enabled. |
| `dell_idrac_redfish` | `adapter_planned` | Validates shape only; live discovery is not enabled. |
| `hpe_ilo_redfish` | `adapter_planned` | Validates shape only; live discovery is not enabled. |
| `lenovo_xcc_redfish` | `adapter_planned` | Validates shape only; live discovery is not enabled. |

## Normalized Node Facts

Discovery preview returns these node fields when present in the intent:

- `nodeSerial`
- `role`
- `bmcAddress`
- `hostIp`
- `cvmIp`
- `hostname`
- `source`
- `factsVerified`

For `manual_static`, `factsVerified` means the value is accepted from operator
intent, not confirmed from hardware. For planned adapters, `factsVerified` is
false until a live read-only adapter is implemented and validated.

## Execution Boundary

Discovery preview is not a deployment precheck. It is an inventory normalization
and intent-shape check. Future live adapters must add authentication handling,
TLS policy, timeout behavior, rate limits, redaction, and vendor-specific
hardware support checks before they can collect facts from BMC or provider APIs.
