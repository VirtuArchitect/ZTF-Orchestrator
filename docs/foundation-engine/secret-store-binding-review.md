# Native Foundation Secret Store Binding Review

Current release marker: `v1.8.1`.

Secret store binding review turns credential-reference inventory into
read-only lease, audit, RBAC, and adapter-handoff records for a future native
Foundation execution runner.

This capability cannot resolve or expose secret values.

## API

```text
POST /api/native-foundation/secrets/store-binding-review
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

Valid intent returns `200` with a blocked read-only binding review. Invalid
intent returns `400`.

## Bindings

Each `bindings` item includes:

- Deterministic binding ID.
- Secret resolution plan ID.
- Site, cluster, node, provider, scope, key, reference, and purpose.
- Lease metadata with `leaseMode: review_only` and `leaseSeconds: 0`.
- RBAC roles for future access.
- `secretStorePathExposed: false`.
- `secretValueExposed: false`.
- `resolved: false`.
- `auditEventRequired: true`.
- `adapterHandoffEnabled: false`.
- `mutatingActionsEnabled: false`.

Bindings deliberately contain reference names only. They do not contain secret
values, decrypted material, or secret-store paths.

## Checks

The response checks:

- Secret resolution plan availability.
- Binding declaration.
- Secret values are not exposed.
- Secret access audit hooks are declared.
- The final secret-store binding disablement block.

## Boundary

Secret store binding review cannot open leases, read secret stores, decrypt or
unwrap values, export secret paths, authenticate to providers, hand credentials
to adapters, call Foundation, call Prism Element, or mutate hardware.

Secret-store binding can only be enabled after RBAC, audit persistence, lease
handling, redaction, adapter handoff, recovery behavior, and controlled hardware
UAT pass in the same change set.
