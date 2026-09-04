# Native Foundation Evidence Packs

Current release marker: `v1.8.1`.

Native Foundation evidence packs are read-only, per-cluster records for UAT and
approval review. They bind the current intent, plan, discovery preview,
execution graph, readiness gates, and adapter contracts into one cluster-scoped
artifact. They do not authorize or run deployment.

## API

```text
POST /api/native-foundation/evidence-packs
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>"
}
```

Invalid intent returns `400` and an empty `packs` list.

## Pack Contents

Each pack includes:

- `packId`: deterministic evidence-pack identifier.
- `planId`, `intentSha256`, and `discoverySha256`: hash binding to the current
  plan inputs.
- `contractVersion`: native Foundation adapter contract version.
- `siteName`, `clusterName`, `hardwareProvider`, and `deploymentType`.
- Node count, role summary, and normalized read-only node facts.
- Site wave, cluster wave, and graph step IDs.
- Current readiness gates.
- Provider and deployment contract status.
- Required promotion evidence for future UAT.

## Use In The Phased Rollout

Evidence packs support the multi-site and multi-cluster phase by giving each
cluster a bounded review record. Operators can compare pack IDs, graph steps,
readiness gates, and contract requirements before a future adapter is promoted.

Future mutating execution must require a matching pack, plan hash, approved
metadata, readiness record, adapter contract version, and controlled UAT result.
Use [Resume Checkpoint](resume-checkpoint.md) to preview restart position and
cluster-scoped next steps from the current graph and evidence packs.
Use [Evidence Pack Approval Review](evidence-pack-approval-review.md) to bind
each pack to Approval Gate and Validation Evidence records and produce
read-only go/no-go records without persisting approval or enabling execution.
Use [Adapter Promotion Review](adapter-promotion-review.md) to compare evidence
packs, readiness gates, checkpoint state, and adapter contracts before any
controlled UAT promotion.
