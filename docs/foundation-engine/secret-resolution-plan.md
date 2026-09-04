# Native Foundation Secret Resolution Plan

Current release marker: `v1.8.1`.

The secret resolution plan inventories credential references that a future
native Foundation adapter would need after approval, evidence, policy, and
adapter gates pass.

This plan is read-only. It never reads, decrypts, unwraps, exports, logs, or
hands off secret values.

## API

```text
POST /api/native-foundation/secrets/resolution-plan
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "approvalId": "<optional approval id>",
  "evidenceId": "<optional validation evidence id>",
  "phase": "full_deployment"
}
```

Valid intent returns `200` with a blocked read-only resolution plan. Invalid
intent returns `400`.

## Resolution Requests

Each request contains:

- Site, optional cluster, optional node, and provider scope.
- Credential reference key and reference name.
- The intended purpose, such as provider/site authentication or node BMC
  authentication.
- `resolved: false`.
- `secretValueExposed: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response includes checks for:

- Valid secret-reference manifest.
- Required credential references.
- Absence of inline secret-like values.
- Execution admission review before secret resolution.
- Secret values not being resolved.
- The disabled secret-store adapter.

## Boundary

This plan does not authenticate to a provider, read any secret store, decrypt
credentials, return secret values, or pass credentials to Foundation execution.
Secret resolution can only be added later inside an approved, audited,
UAT-validated adapter execution path.
