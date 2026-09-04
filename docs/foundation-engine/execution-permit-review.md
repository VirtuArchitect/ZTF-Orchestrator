# Native Foundation Execution Permit Review

Current release marker: `v1.8.1`.

Execution permit review composes the final read-only gate package a future
native Foundation run would need before job submission. It binds the current
plan, approval, Validation Evidence, execution admission review, execution
request, dry-run ledger, recovery plan, job-state plan, and disabled adapter
registry draft into one deterministic permit object. It also carries retained
evidence export, secret audit persistence, and packet output/export gate
prerequisites forward from request, ledger, and job-state planning.

This capability cannot issue a permit.

## API

```text
POST /api/native-foundation/execution/permit-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "approvalId": "<optional approval id>",
  "evidenceId": "<optional validation evidence id>",
  "phase": "full_deployment"
}
```

Valid intent returns `200` with a blocked read-only permit review. Invalid
intent returns `400`.

## Permit Object

The response includes an `executionPermit` with:

- Deterministic permit ID.
- Plan ID, intent SHA256, and discovery SHA256.
- Approval and evidence IDs when supplied.
- Execution request ID.
- Dry-run ledger ID.
- Job state ID.
- Adapter request IDs.
- Adapter request packet gate summaries and ledger gate-summary count, when
  matching packet evidence is supplied.
- Adapter registry draft entry IDs.
- Required review artifact names for admission, request, dry-run ledger,
  recovery, job state, retained evidence export, secret audit persistence, and
  adapter registry enablement.
- Source review status for those prerequisite reviews.
- `issued: false`.
- `submitted: false`.
- `permitMode: review_only`.
- `targetExecutionStatus: not_permitted`.
- `canIssuePermit: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Native Foundation plan validity.
- Approval and Validation Evidence binding.
- Execution admission readiness.
- Execution request readiness.
- Dry-run ledger readiness.
- Packet output/export gate summary binding.
- Recovery plan readiness.
- Job-state plan readiness.
- Retained evidence export prerequisite declaration.
- Secret audit persistence prerequisite status.
- Adapter enablement registry review readiness.
- The final execution permit disablement block.

## Boundary

Execution permit review cannot issue permits, persist authorization, enqueue
jobs, load adapter code, resolve secrets, call Foundation, call Prism Element,
run a dry run, execute recovery, export retained evidence, persist secret audit
entries, or mutate hardware.

A permit package is an approval artifact only. Future permit issuance must be
implemented with controlled hardware UAT evidence, adapter registry mutation,
job submission, secret resolution, recovery execution, audit retention, and
updated operator runbooks in the same change set.
