# Native Foundation Backup/Restore Review

Current release marker: `v1.8.0`.

Backup/restore review composes the native Foundation execution retention plan,
audit plan, job-state plan, resume checkpoint, and restart/resume review into a
single read-only disaster-recovery readiness record.

This capability cannot create backups, read retained artifacts, restore state,
restore checkpoints, replay queues, start runners, call adapters, or mutate
hardware.

## API

```text
POST /api/native-foundation/execution/backup-restore-review
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

Valid intent returns `200` with a blocked read-only backup/restore review.
Invalid intent returns `400`.

When `approvalId` and `evidenceId` identify the same reviewed native Foundation
package, the review inherits packet output/export gate summary counts from the
retention and audit planning path. Without that binding, those inherited counts
remain zero or blocked.

## Records

Each `backupRestoreRecords` item includes:

- Deterministic backup/restore record ID.
- Artifact name and source backup target ID.
- Source retention, restart/resume, audit, job-state, and checkpoint IDs.
- Database-backup and evidence-export coverage flags.
- Whether the artifact would require checkpoint restore or restart replay.
- `backupCreated: false`.
- `restoreTested: false`.
- `checkpointRestored: false`.
- `replayValidated: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Execution retention plan availability.
- Backup target declaration.
- Restore rehearsal declaration.
- Restart/resume review availability.
- Resume checkpoint availability.
- Execution audit plan availability.
- Job-state plan availability.
- The retained artifact persistence disablement block.
- The backup creation disablement block.
- The restore execution disablement block.
- The checkpoint restore disablement block.

## Boundary

Backup/restore review is an approval and operations-planning artifact only. It
does not prove disaster recovery readiness and does not replace a controlled UAT
restore drill.

Enabling backup/restore requires retained artifact persistence, backup creation,
restore rehearsal, checkpoint restore, restart replay, audit retention, RBAC
export, disaster-recovery runbooks, and controlled hardware UAT evidence.
