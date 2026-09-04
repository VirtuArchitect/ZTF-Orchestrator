# Native Foundation Execution Retention Plan

Current release marker: `v1.8.1`.

Execution retention plan review declares the retention policies, backup targets,
and restore rehearsal checks a future native Foundation run would need before
audit trails, job state, checkpoints, retained-export prerequisites,
secret-audit prerequisites, packet output/export gate summaries, and redacted
evidence can be retained.

This capability cannot persist retained artifacts, create backups, restore
state, or export retained evidence.

## API

```text
POST /api/native-foundation/execution/retention-plan
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "phase": "full_deployment",
  "approvalId": "<optional approval id>",
  "evidenceId": "<optional validation evidence id>"
}
```

Valid intent returns `200` with a blocked read-only retention plan. Invalid
intent returns `400`.

When `approvalId` and `evidenceId` identify the same reviewed native Foundation
package, the retention plan inherits the audit-plan packet output/export gate
summary counts and source review statuses. Without that binding, the inherited
packet summary check remains blocked.

## Retention Policies

Each `retentionPolicies` item includes:

- Policy ID.
- Artifact names covered by the policy.
- Retention days derived from the appliance audit and execution retention
  settings.
- Required encryption-at-rest and redaction flags.
- RBAC roles for future export.
- `storageMode: review_only`.
- `persisted: false`.
- `mutatingActionsEnabled: false`.

The policy set covers audit events, execution history, redacted evidence, and
review-packet artifacts.

## Backup Targets

Each `backupTargets` item includes:

- Deterministic target ID.
- Artifact name.
- Backup mode.
- Database-backup and evidence-export coverage indicators.
- `backupCreated: false`.
- `restoreTested: false`.
- `mutatingActionsEnabled: false`.

## Restore Rehearsal Checks

The response declares blocked restore rehearsal checks for:

- JSONL audit-log readability.
- Job-state to checkpoint/recovery mapping.
- Redacted evidence hash validation.
- Operator RBAC export review.

The backup target list includes the retained evidence export review and secret
audit persistence review artifacts, but neither artifact is written or restored
by this release.

Use [Backup/Restore Review](backup-restore-review.md) to compose these
retention targets with checkpoint, job-state, audit, and restart/resume
metadata before any future disaster-recovery enablement path.

## Checks

The response checks:

- Execution audit plan availability.
- Job-state artifact availability.
- Recovery plan availability.
- Retained evidence export prerequisite declaration.
- Secret audit persistence prerequisite status.
- Packet output/export gate summary inheritance from audit planning.
- Retention policy declaration.
- Backup target declaration.
- Restore rehearsal declaration.
- The final retention-persistence disablement block.

## Boundary

Execution retention plan review cannot write artifact records, create database
backups, restore database state, export retained evidence, validate replay, run
adapters, call Foundation, call Prism Element, resolve secrets, persist secret
audit entries, or mutate hardware.

Retention persistence requires storage schema, RBAC export, backup creation,
restore rehearsal, replay validation, redaction review, and controlled hardware
UAT evidence before this boundary can change.
