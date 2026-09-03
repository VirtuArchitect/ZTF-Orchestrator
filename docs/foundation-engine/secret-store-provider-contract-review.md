# Native Foundation Secret Store Provider Contract Review

Current release marker: `v1.8.0`.

Secret store provider contract review declares the provider-side contract that a
future native Foundation execution adapter would need before resolving named
credential references.

This capability cannot authenticate to a secret store, open leases, read paths,
resolve values, persist provider configuration, or hand credentials to adapters.

## API

```text
POST /api/native-foundation/secrets/provider-contract-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "approvalId": "<optional approval id>",
  "evidenceId": "<optional validation evidence id>",
  "phase": "full_deployment",
  "secretStoreProvider": "hashicorp_vault",
  "secretStoreRef": "private-secret-store/vault-lab"
}
```

Valid intent returns `200` with a blocked read-only provider contract review.
Invalid intent returns `400`.

## Provider Contracts

The read-only review recognizes these provider IDs for contract planning:

- `hashicorp_vault`
- `cyberark_conjur`
- `azure_key_vault`
- `aws_secrets_manager`
- `generic`

Each `providerContract` includes provider ID, provider label, private provider
reference, binding review ID, binding count, credential reference count,
supported auth modes, required controls, RBAC roles, audit requirement,
redaction requirement, and disabled capability flags.

The provider contract deliberately contains reference metadata only. It does not
contain secret values, decrypted material, secret-store paths, tokens, leases,
or provider SDK responses.

## Checks

The response checks:

- Secret-store binding review availability.
- Secret-store provider declaration.
- Recognized provider contract.
- Private secret-store reference declaration.
- Secret values not being exposed.
- The final lease-opening disablement block.
- The final provider approval disablement block.

## Boundary

Secret store provider contract review cannot approve providers, persist provider
configuration, authenticate, open leases, read secret-store paths, decrypt
values, resolve values, export credentials, hand credentials to adapters, call
Foundation, call Prism Element, contact BMCs, or mutate infrastructure.

Secret-store providers can only be enabled through a future explicit adapter
path with RBAC, audit persistence, lease handling, redaction tests, controlled
hardware UAT, and private provider evidence.
