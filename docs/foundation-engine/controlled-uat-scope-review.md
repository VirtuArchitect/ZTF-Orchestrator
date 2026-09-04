# Native Foundation Controlled UAT Scope Review

Current release marker: `v1.8.1`.

Controlled UAT scope review declares the bounded site, cluster, provider,
deployment type, node, wave, and artifact scope that would be required before a
future native Foundation hardware UAT lane can be explicitly enabled. It also
copies retained-evidence export and secret-audit persistence prerequisite
statuses plus packet output/export gate summary counts from the controlled UAT
entry review into each scope record.

This capability cannot authorize UAT or reserve hardware.

## API

```text
POST /api/native-foundation/uat/scope-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "providerId": "manual_static",
  "deploymentType": "hci",
  "approvalId": "<optional approval request id>",
  "evidenceId": "<optional validation evidence id>",
  "phase": "full_deployment"
}
```

Valid intent returns `200` with a blocked read-only scope review. Invalid intent
returns `400`.

## Scope Records

Each `scopeRecords` item includes:

- Scope ID.
- Evidence pack ID.
- Site and cluster names.
- Provider and deployment type.
- Deployment phase.
- Site and cluster wave.
- Node count, role summary, and node serials.
- Required evidence.
- Required sanitized artifacts.
- Required prerequisite artifacts.
- Source review status for controlled UAT entry, retained evidence export, and
  secret audit persistence.
- Inherited adapter output evidence, retained export review, command invocation,
  and packet gate summary counts when approval/evidence binding is supplied.
- Deployment policy limits.
- `canAuthorizeScope: false`.
- `canEnterControlledUat: false`.
- `mutatingActionsEnabled: false`.

The review can be filtered to one provider and deployment type. When no filter
is supplied, it declares scope records for every cluster evidence pack in the
intent.

## Checks

The response checks:

- Scope records are declared.
- Bounded site scope is declared.
- Bounded node scope is declared.
- Controlled UAT entry review is available.
- Retained evidence export prerequisite is present.
- Secret audit persistence prerequisite is present.
- Packet output/export gate summary is inherited.
- The final scope-authorization disablement block.

## Boundary

Controlled UAT scope review cannot reserve hardware, authorize UAT, load
adapters, start jobs, issue permits, acquire locks, resolve secrets, call
Foundation, contact Prism Element, contact BMCs, append audit events, create
backups, restore state, export retained evidence, persist secret audit records,
or mutate infrastructure.

A future controlled UAT enablement must name the exact hardware scope, evidence
retention target, rollback owner, outage or lab window, provider adapter, and
deployment topology before any mutating operation can be enabled.
