# Native Foundation Adapter Allow-List Review

Current release marker: `v1.8.1`.

Adapter allow-list review turns disabled adapter registry drafts into read-only
allow-list entries for future controlled-UAT approval review. Each entry carries
the controlled UAT completion requirement from adapter enablement.

This capability cannot approve, persist, load, enable, or run native Foundation
adapters.

## API

```text
POST /api/native-foundation/adapter-allowlist/review
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "providerId": "manual_static",
  "deploymentType": "hci",
  "approvalId": "<optional approval id>",
  "evidenceId": "<optional validation evidence id>",
  "allowListOwner": "platform-lead",
  "allowListRef": "private-allow-list/AL-3001"
}
```

Valid intent returns `200` with a blocked read-only allow-list review. Invalid
intent returns `400`.

## Allow-List Entries

Each `allowListEntries` item includes:

- Deterministic allow-list entry ID.
- Source registry entry ID and registry key.
- Provider ID and deployment type.
- Site, cluster, and node scope.
- Controlled UAT completion requirement and current completion status.
- Required review artifacts.
- Blocked mutating operations.
- `allowed: false`.
- `canPersistAllowList: false`.
- `canLoadAdapter: false`.
- `mutatingActionsEnabled: false`.

Allow-list entries deliberately remain approval artifacts. They do not modify
the adapter registry or permit runtime adapter loading.

## Checks

The response checks:

- Adapter registry review availability.
- Allow-list owner declaration.
- Private allow-list reference declaration.
- Controlled UAT security review availability.
- Controlled UAT operations review availability.
- Secret-store provider contract review availability.
- Controlled UAT completion requirement for every allow-list entry.
- The final allow-list persistence disablement block.

## Boundary

Adapter allow-list review cannot approve entries, persist entries, enable
adapters, load adapter code, start jobs, issue permits, acquire locks, resolve
secrets, call Foundation, contact Prism Element, contact BMCs, or mutate
infrastructure.

Adapter allow-list persistence can only be enabled through a future explicit
enablement path with private approval evidence, controlled UAT security and
operations signoff, controlled UAT completion evidence, and release
documentation.
