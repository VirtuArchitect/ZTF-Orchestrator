# Native Foundation Plan And Approval Binding

Current release marker: `v1.8.1`.

Native Foundation plan generation creates deterministic read-only metadata for
a `native-foundation-deploy` intent. The plan does not authorize or run
deployment. It gives operators and future execution adapters a stable object to
review, approve, and bind to exact input hashes.

## API

```text
POST /api/native-foundation/plan
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>"
}
```

Response fields:

| Field | Purpose |
|---|---|
| `planId` | Deterministic plan identifier derived from intent and discovery hashes. |
| `intentSha256` | SHA256 of the submitted YAML content. |
| `discoverySha256` | SHA256 of the normalized discovery preview. |
| `summary` | Site, cluster, node, deployment type, and role counts. |
| `approvalMetadata` | Copy-ready metadata for future native Foundation execution approval. |
| `readOnly` | Always `true` in this release. |
| `mutatingActionsEnabled` | Always `false` in this release. |

## Approval Metadata

```json
{
  "framework": "native-foundation",
  "workflow": "native-foundation-deploy",
  "planId": "native-foundation-...",
  "intentSha256": "...",
  "discoverySha256": "...",
  "siteScope": ["site-a"],
  "clusterScope": ["hci-cluster-a"]
}
```

Future execution adapters must require approval metadata that matches the plan
ID, intent hash, discovery hash, site scope, and cluster scope. If any input,
provider fact, image reference, topology rule, or site scope changes, operators
must generate and approve a new plan.

Use `POST /api/native-foundation/approval-binding/review` to verify that an
approved `native-foundation-deploy` request and a captured Validation Evidence
record still match the current plan. The review confirms approval state,
workflow, intent hash or plan metadata, packet ID, contract version, and the
stored native Foundation review packet before reporting that execution remains
disabled.

## Current Boundary

The endpoint is available to admin, operator, and viewer roles because it is
read-only. It does not create an approval request automatically, does not start
a job, does not contact hardware, and does not enable deployment execution.
