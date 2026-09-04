# Native Foundation Adapter Runtime Admission Review

Current release marker: `v1.8.1`.

Adapter runtime admission review records the operator admission owner, private
runtime admission reference, private change ticket reference, private exception
reference, controlled UAT completion requirement, retained evidence export
prerequisite status, and secret-audit prerequisite status plus packet
output/export gate summaries required before a future native Foundation adapter
runtime could be admitted.

This capability cannot admit runtime entries, load adapter code, instantiate
adapters, open secret leases, hand credentials to adapters, start adapter
processes, submit mutating native Foundation jobs, call Foundation, contact
Prism Element, contact BMCs, or mutate infrastructure.

## API

```text
POST /api/native-foundation/adapters/runtime-admission-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "providerId": "manual_static",
  "deploymentType": "hci",
  "phase": "full_deployment",
  "approvalId": "<native-foundation approval id>",
  "evidenceId": "<native-foundation validation evidence id>",
  "admissionOwner": "platform-owner",
  "runtimeAdmissionRef": "private-runtime-admissions/manual-static-hci-1.0.0",
  "changeTicketRef": "private-changes/CHG-4001",
  "exceptionRef": "none"
}
```

Valid intent returns `200` with a blocked read-only runtime admission review.
Invalid intent returns `400`.

## Admission Entries

Each `runtimeAdmissionEntries` item includes:

- Deterministic runtime admission entry ID.
- Source runtime isolation, SBOM, package provenance, and load-plan entry IDs.
- Provider, deployment type, and provider adapter ID.
- Admission owner, admission reference, change ticket reference, and exception
  reference metadata.
- Controlled UAT completion requirement and status inherited from runtime
  isolation.
- Required review artifact names.
- Required prerequisite artifact names inherited from runtime isolation, SBOM,
  and package provenance review.
- Source review status for runtime isolation, SBOM, package provenance,
  controlled UAT completion, retained evidence export, secret audit
  persistence, and packet output/export gates.
- Packet gate summary counts inherited from matched approval and validation
  evidence review packets.
- Blocked mutating operations.
- `canAdmitAdapterRuntime: false`.
- `canLoadAdapter: false`.
- `canStartAdapterProcess: false`.
- `canHandCredentialsToAdapter: false`.
- `canSubmitMutatingJob: false`.
- `mutatingActionsEnabled: false`.

The review ties runtime admission entries to adapter runtime isolation review,
adapter SBOM review, adapter package provenance review, adapter load plan
review, retained evidence export review, secret audit persistence review,
controlled UAT signoff review, controlled UAT completion review, execution
permit review, and matching approval/evidence packet gate summaries. Admission
references are checked as metadata only; no runtime is admitted.

## Metadata

The optional metadata fields are reviewed as text only:

- `admissionOwner`
- `runtimeAdmissionRef`
- `changeTicketRef`
- `exceptionRef`
- `approvalId`
- `evidenceId`

Supplying these values can clear the corresponding metadata checks. Adapter
runtime admission, adapter loading, adapter instantiation, credential handoff,
adapter process start, mutating job submission, Foundation calls, Prism Element
calls, BMC contact, and hardware mutation remain blocked.

## Boundary

Adapter runtime admission review cannot create approval records, admit runtime
entries, load code, instantiate adapters, open secret leases, hand credentials
to adapters, start processes, submit jobs, replay queues, call Foundation,
contact Prism Element, contact BMCs, export retained evidence, persist secret
audit entries, or mutate infrastructure.

A future runtime admission path must be an explicit enablement change with
signed package provenance, SBOM and vulnerability evidence, sandbox runtime
approval, packet output/export gate evidence, change control, exception
handling, secret audit persistence controls, secret handoff controls,
controlled UAT signoff, operator runbooks, release documentation, and
controlled hardware UAT evidence.
