# Native Foundation Discovery Contract

Current release marker: `v1.8.0`.

The discovery contract defines the provider-specific request and response shape
that future live discovery adapters must satisfy before any imaging or cluster
formation can be considered.

## API

```text
POST /api/native-foundation/discovery/contract
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>"
}
```

Valid intent returns `200` with a blocked read-only contract manifest. Invalid
intent returns `400`.

## Contract Scope

The manifest records:

- Provider-specific input fields for manual inventory, Redfish BMC discovery,
  NX API discovery, or Cisco Intersight discovery.
- Credential reference field names, without resolving secret values.
- Expected normalized discovery output fields, including serial, model, BMC,
  power, boot, NIC, disk, firmware, and unsupported-fact records.
- Evidence requirements for controlled live discovery UAT.

## Boundary

The endpoint does not contact providers, log in, collect live inventory, store
raw provider payloads, resolve secrets, power-cycle hardware, mount images,
image nodes, or form clusters.

## Promotion Rule

Live discovery must be promoted one provider contract at a time. Promotion
requires provider preflight, named secret references, RBAC, audit logging,
secret-store controls, controlled hardware UAT evidence, and updated support
documentation.
