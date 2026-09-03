# Native Foundation Controlled UAT Execution Authorization Review

Current release marker: `v1.8.0`.

Controlled UAT execution authorization review declares the read-only controls
that would be needed before a native Foundation deployment action could be
authorized after runner admission. It composes controlled UAT runner admission,
adapter execution preflight, target connectivity, credential handoff, command
invocation, and output evidence reviews into future execution-authorization
records.

This capability cannot authorize execution, invoke adapters, capture live
output, persist output evidence, submit jobs, or call Foundation.

## API

```text
POST /api/native-foundation/uat/execution-authorization-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "phase": "full_deployment",
  "providerId": "<optional provider id>",
  "deploymentType": "<optional deployment type>",
  "approvalId": "<optional approval id>",
  "evidenceId": "<optional validation evidence id>"
}
```

Valid intent returns `200` with a blocked read-only execution authorization
review. Invalid intent returns `400`.

## Execution Authorization Records

Each `executionAuthorizationRecords` item includes:

- Execution authorization record ID, runner admission review ID, runner
  admission record ID, start readiness record ID, runtime admission review ID,
  runtime isolation review ID, runner readiness ID, execution preflight review
  ID, target connectivity review ID, credential handoff review ID, command
  invocation review ID, command invocation entry ID, output evidence review ID,
  and output evidence entry ID.
- Provider ID, deployment type, site names, cluster count, plan ID, and intent
  hash.
- Approval ID and Validation Evidence ID when supplied.
- Deployment window reservation IDs, scheduler item IDs, and lock request IDs.
- `executionAuthorizationPersisted: false`.
- `executionAuthorized: false`.
- `adapterCommandInvoked: false`.
- `liveOutputCaptured: false`.
- `outputEvidencePersisted: false`.
- `mutatingJobSubmitted: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Source reviews are linked.
- Controlled UAT runner admission records are present.
- Adapter command invocation review is linked.
- Adapter output evidence review is linked.
- Approval and evidence gates are bound to execution authorization.
- Execution authorization persistence remains disabled.
- Adapter command invocation remains disabled.
- Live output capture remains disabled.
- Mutating native Foundation job submission remains disabled.

## Boundary

Controlled UAT execution authorization review cannot persist authorization,
authorize execution, write command files, invoke adapters, open target
connections, open secret leases, capture live output, persist evidence, submit
jobs, call Foundation, call Prism Element, contact BMCs, or mutate hardware.

Authorizing native Foundation execution requires a future explicit change after
runner admission, target connectivity, credential handoff, command invocation,
live output capture, output evidence persistence, job submission, audit,
rollback, and release documentation are implemented and UAT-proven.
