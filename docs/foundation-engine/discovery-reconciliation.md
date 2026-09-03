# Native Foundation Discovery Reconciliation

Current release marker: `v1.8.0`.

Discovery reconciliation compares the intended node plan with supplied
adapter-style discovery facts. It is the review step between a live discovery
contract and any future provider adapter promotion.

## API

```text
POST /api/native-foundation/discovery/reconcile
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>",
  "discoveryFacts": {
    "sites": []
  }
}
```

`discoveryFacts` is optional. If it is absent, the endpoint looks for
`foundation_engine.discovery_results` or site-level `discovery_facts` in the
intent. Valid intent returns `200` with a blocked read-only reconciliation
manifest. Invalid intent returns `400`.

## What It Compares

- Intended node serials versus discovered node serials.
- Expected and discovered site names.
- Expected and discovered BMC addresses.
- Required normalized hardware inventory fields such as model, power state,
  boot mode, NIC inventory, disk inventory, and firmware versions.
- Unexpected discovered nodes.
- Inline secret-like fields in supplied discovery facts.

## Boundary

The endpoint does not call providers, resolve secrets, store raw provider
payloads, mutate hardware, image nodes, or form clusters. Discovery facts are
reviewed as operator-supplied metadata only.

## Promotion Rule

Reconciliation output cannot promote execution by itself. Future live discovery
promotion requires provider UAT evidence proving that normalized facts are
complete, non-secret-bearing, reproducible, and tied to the approved plan hash.
