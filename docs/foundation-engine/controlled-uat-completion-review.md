# Native Foundation Controlled UAT Completion Review

Current release marker: `v1.8.0`.

Controlled UAT completion review declares the read-only controls that would be
needed before a native Foundation controlled-UAT run could be marked complete,
used for adapter promotion, or used as production-support evidence. It composes
controlled UAT execution authorization, adapter output evidence, retained
evidence export, controlled UAT signoff, and UAT evidence acceptance reviews
into future completion records.

This capability cannot mark UAT complete, persist completion state, promote
adapters, certify production support, submit jobs, call Foundation, or mutate
hardware.

## API

```text
POST /api/native-foundation/uat/completion-review
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

Valid intent returns `200` with a blocked read-only controlled UAT completion
review. Invalid intent returns `400`.

## Completion Records

Each `uatCompletionRecords` item includes:

- Completion record ID, execution authorization review ID, execution
  authorization record ID, runner persistence admission IDs, runner admission
  record ID, authorization persistence admission IDs, output evidence review
  ID, retained evidence export review ID, controlled UAT signoff review ID,
  and UAT evidence acceptance review ID.
- Provider ID, deployment type, site names, cluster count, plan ID, and intent
  hash.
- Approval ID and Validation Evidence ID when supplied.
- `executionAuthorized: false`.
- `executionAuthorizationPersisted: false`.
- `adapterCommandInvoked: false`.
- `liveOutputCaptured: false`.
- `outputEvidencePersisted: false`.
- `retainedEvidenceExported: false`.
- `controlledUatCompleted: false`.
- `completionPersisted: false`.
- `adapterPromotionEligible: false`.
- `productionSupportEligible: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Source reviews are linked.
- Execution authorization records are present.
- Approval and evidence gates are bound to UAT completion.
- Retained evidence export review is linked.
- Adapter output evidence review is linked.
- Controlled UAT signoff review is linked.
- Controlled UAT completion persistence remains disabled.
- Adapter promotion remains disabled.
- Production support certification remains disabled.
- Mutating native Foundation job submission remains disabled.

## Boundary

Controlled UAT completion review cannot persist completion state, mark UAT
complete, promote adapters, change allow-lists, certify production support,
submit jobs, call Foundation, call Prism Element, contact BMCs, or mutate
hardware.

Marking controlled UAT complete requires a future explicit change after
execution authorization persistence, command invocation, retained evidence
export, output evidence persistence, signoff, promotion policy, support policy,
and release documentation are implemented and UAT-proven.
