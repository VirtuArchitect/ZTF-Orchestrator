# Native Foundation Adapter Output Evidence Review

Current release marker: `v1.8.1`.

Adapter output evidence review records the owner, private output retention
reference, artifact redaction reference, failure classification reference, and
evidence store reference plus retained evidence export and secret-audit
prerequisite status, controlled UAT completion requirement, and inherited
packet output/export gate summaries that a future native Foundation adapter
would need before command output or adapter artifacts could be captured and
retained.

This capability cannot capture stdout, capture stderr, write adapter artifacts,
persist validation evidence, classify live adapter failures, export retained
evidence, submit mutating native Foundation jobs, or mutate infrastructure.

## API

```text
POST /api/native-foundation/adapters/output-evidence-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "providerId": "manual_static",
  "deploymentType": "hci",
  "phase": "full_deployment",
  "approvalId": "appr_123",
  "evidenceId": "evidence_123",
  "evidenceOwner": "operations-owner",
  "outputRetentionRef": "private-retention/native-foundation-output",
  "artifactRedactionRef": "private-redaction/native-foundation-artifacts",
  "failureClassificationRef": "private-failure-taxonomy/native-foundation",
  "evidenceStoreRef": "private-evidence-store/native-foundation"
}
```

Valid intent returns `200` with a blocked read-only output evidence review.
Invalid intent returns `400`.

## Evidence Entries

Each `outputEvidenceEntries` item includes:

- Deterministic output evidence entry ID.
- Source command invocation, credential handoff, target connectivity, execution
  preflight, and runtime admission entry IDs.
- Provider, deployment type, provider adapter ID, site names, cluster names, and
  phase.
- Output evidence owner, retention, redaction, failure classification, and
  evidence store metadata.
- Controlled UAT completion requirement and inherited completion status from
  adapter command invocation.
- Required review artifact names.
- Required prerequisite artifact names inherited from command invocation,
  credential handoff, target connectivity, execution preflight, runtime
  admission, runtime isolation, SBOM, and package provenance review.
- Source review status for command invocation, credential handoff, target
  connectivity, controlled UAT completion, retained evidence export, secret
  audit persistence, and packet output/export gate summaries.
- Blocked evidence and mutating operations.
- `outputCaptureStatus: not_started`.
- `evidencePersistenceStatus: not_persisted`.
- `failureClassificationStatus: not_run`.
- `commandOutputCaptured: false`.
- `stdoutCaptured: false`.
- `stderrCaptured: false`.
- `artifactsWritten: false`.
- `artifactsRedacted: false`.
- `evidencePersisted: false`.
- `liveFailuresClassified: false`.
- `canCaptureCommandOutput: false`.
- `canPersistEvidence: false`.
- `canWriteArtifacts: false`.
- `canClassifyLiveFailures: false`.
- `canSubmitMutatingJob: false`.
- `mutatingActionsEnabled: false`.

The review ties output evidence entries to adapter command invocation review,
adapter credential handoff review, adapter target connectivity review,
controlled UAT completion review, retained evidence export review, secret audit
persistence review, execution audit plan, and execution retention plan.
References are checked as metadata only; no live command output is captured and
no evidence record is persisted.
When matching `approvalId` and `evidenceId` values are supplied, the review can
bind the upstream packet gate counts into `sourceReviews`,
`summary.adapterRequestGateSummaryCount`, and
`summary.stepAuditEventGateSummaryCount`.

## Metadata

The optional metadata fields are reviewed as text only:

- `evidenceOwner`
- `outputRetentionRef`
- `artifactRedactionRef`
- `failureClassificationRef`
- `evidenceStoreRef`
- `approvalId`
- `evidenceId`

Supplying these values can clear the corresponding metadata checks. Live output
capture, artifact writes, redaction application, evidence persistence, live
failure classification, retained evidence export, and mutating job submission
remain blocked.

## Boundary

Adapter output evidence review cannot create approval records, capture stdout,
capture stderr, write adapter artifacts, redact live artifacts, persist
validation evidence, classify live failures, export retained evidence, submit
jobs, persist secret audit entries, replay queues, or mutate infrastructure.

A future output evidence path must be an explicit enablement change with live
command execution, redaction tests, retention controls, audit persistence,
failure taxonomy, release documentation, and controlled hardware UAT evidence.
