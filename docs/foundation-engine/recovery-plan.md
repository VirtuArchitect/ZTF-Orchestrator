# Native Foundation Recovery Plan

Current release marker: `v1.8.0`.

The recovery plan describes how a future native Foundation execution request
would be stopped, retried, or reviewed after failure across sites and clusters,
including retained evidence export prerequisite declaration and secret-audit
prerequisite status plus inherited packet output/export gate summaries.

This capability is read-only. It cannot pause jobs, retry adapters, roll back
hardware state, or execute runbooks.

## API

```text
POST /api/native-foundation/execution/recovery-plan
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "phase": "full_deployment",
  "providerId": "manual_static",
  "deploymentType": "hci",
  "approvalId": "appr_123",
  "evidenceId": "evidence_123"
}
```

Valid intent returns `200` with a blocked read-only recovery plan. Invalid
intent returns `400`.

## Recovery Actions

Each planned recovery action contains:

- Adapter request ID and deterministic recovery request ID.
- Site, cluster, provider, deployment type, and phase.
- Failure policy and derived recovery scope.
- Resume checkpoint state for the cluster.
- Operator action labels for pausing work, capturing logs, reviewing
  checkpoint state, deciding retry/skip/abort, and recording evidence.
- Required review artifact names for execution request, checkpoint, retained
  evidence export, and secret audit persistence.
- Source review status for retained evidence export, output evidence, command
  invocation, secret audit persistence, and packet gate counts.
- Manual retry policy.
- Manual runbook-only rollback policy.
- `canExecuteRecovery: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Execution request review availability.
- Failure policy review.
- Clear checkpoint state.
- Retained evidence export prerequisite declaration.
- Secret audit persistence prerequisite status.
- Packet gate summary availability when matching approval/evidence IDs are
  supplied.
- Recovery action declaration.
- The final recovery execution disablement block.

## Boundary

The recovery plan does not stop running jobs, retry adapter requests, roll back
hosts, change boot state, contact Foundation, contact Prism Element, collect
live evidence, or generate the retained evidence export review. Provider-specific
recovery execution requires retained evidence export controls, secret audit
persistence controls, controlled UAT, updated runbooks, and security review
before this boundary can change.
