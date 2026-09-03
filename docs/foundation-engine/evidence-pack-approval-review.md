# Native Foundation Evidence Pack Approval Review

Current release marker: `v1.8.0`.

Evidence pack approval review converts per-cluster evidence packs into
read-only go/no-go records. It binds each pack to the supplied Approval Gate
request and Validation Evidence record, checks accepted UAT evidence references,
and reports whether the pack is ready for operator review before any future
deployment wave can run.

This capability does not persist decisions, approve deployment, enqueue jobs,
start runners, call Foundation, contact hardware providers, resolve secrets, or
mutate infrastructure.

## API

```text
POST /api/native-foundation/evidence-packs/approval-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>",
  "phase": "full_deployment",
  "approvalId": "<optional approval id>",
  "evidenceId": "<optional validation evidence id>"
}
```

Valid intent returns `200` with a blocked read-only approval review. Invalid
intent returns `400`.

## Review Output

The review returns:

- `packApprovals`: one deterministic approval record per evidence pack.
- `bindingStatus`: whether the supplied Approval Gate and Validation Evidence
  record bind to the same reviewed native Foundation packet.
- `evidenceRequirements`: each required promotion evidence item and its accepted
  evidence ID status.
- `goNoGoDecisionStatus`: `ready_for_review` only when the binding and evidence
  requirement checks pass. This is still not execution approval.
- `checks`: evidence-pack presence, approval/evidence binding, evidence
  requirement readiness, approval-record presence, and the final persistence
  disablement block.

## Boundary

Every response returns `status: blocked`, `canApproveEvidencePacks: false`,
`canStartApprovedClusters: false`, and `mutatingActionsEnabled: false`.
Evidence pack approval can only become persistent in a future explicit change
after approval workflow storage, RBAC, audit persistence, retained evidence
export, deployment wave locks, and controlled hardware UAT are validated.
