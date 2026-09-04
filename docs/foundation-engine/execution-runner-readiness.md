# Native Foundation Runner Readiness

Current release marker: `v1.8.1`.

Runner readiness review composes the final read-only blockers that must be
cleared before a native Foundation execution runner could start mutating adapter
work for imaging, cluster formation, post-create validation, recovery, retained
evidence export, backup/restore, restart/resume, or secret audit persistence.

This capability cannot start a runner.

## API

```text
POST /api/native-foundation/execution/runner-readiness
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "phase": "full_deployment"
}
```

Valid intent returns `200` with a blocked read-only runner readiness review.
Invalid intent returns `400`.

## Readiness Items

Each `readinessItems` item includes:

- Readiness item ID.
- Label.
- Source artifact and source ID.
- Status.
- Whether the item is required for runner start.
- `mutatingActionsEnabled: false`.

The review passes artifact-availability items such as plan binding and review
packet availability, then blocks the required mutating prerequisites:

- Permit issuance.
- Lock acquisition and persistence.
- Audit persistence.
- Backup/restore review for retention targets, restore rehearsal checks,
  checkpoint restore, and replay readiness.
- Retained evidence export controls.
- Secret-store lease binding and credential handoff inside approved execution.
- Secret lease audit persistence and retained-artifact controls.
- Adapter registry enablement.
- Adapter activation approval.
- Controlled UAT entry issuance.
- Controlled hardware UAT completion.

## Checks

The response checks:

- Runner readiness items are declared.
- Required runner blockers are declared.
- The final runner-start disablement block.

## Boundary

Runner readiness review cannot issue permits, acquire locks, append audit
events, persist retained artifacts, create backups, restore state, resolve
secrets, export retained evidence, persist secret audit entries, load adapters,
start jobs, call Foundation, call Prism Element, or mutate hardware.

A future runner start path must land with permit issuance, lock persistence,
audit and retention persistence, secret resolution, adapter registry mutation,
retained evidence export controls, secret audit persistence, credential handoff
controls, adapter registry mutation, activation approval, controlled UAT entry
issuance, recovery behavior, updated runbooks, and controlled hardware UAT
evidence in the same change set.

Use [Mutating Enablement Review](mutating-enablement-review.md) to compose the
final disabled execution-enable gate from runner readiness, backup/restore,
controlled UAT signoff, adapter runtime, connectivity, credential, command,
output evidence, and retained export reviews.
