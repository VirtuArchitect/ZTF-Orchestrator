# Native Foundation Review Packet

Current release marker: `v1.8.0`.

The native Foundation review packet is a downloadable ZIP bundle for approval
and controlled-UAT review. It collects the read-only artifacts generated from a
single `native-foundation-deploy` intent and redacts sensitive intent fields
before export.

## API

```text
POST /api/native-foundation/review-packet
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>",
  "phase": "full_deployment",
  "approvalId": "<optional approved native Foundation request id>",
  "evidenceId": "<optional Validation Evidence packet id>"
}
```

Valid intent returns an `application/zip` download named after the deterministic
packet ID. Invalid intent returns `400` with no ZIP bundle.

When `approvalId` and `evidenceId` are supplied, the manifest records the
binding IDs and the exported execution request, recovery plan, and job state
plan carry the same packet output/export gate summaries used by the direct
review APIs and durable review job. The packet also includes the
provider/topology matrix so multi-site hardware-provider and HCI, compute,
storage, or mixed topology readiness is preserved with the approval bundle. The
provider operation catalog is included with it so the future operation set for
each site and cluster is reviewed from the same immutable packet. The provider
operation admission review records whether those operations would be admitted
to a future controlled UAT lane; in this release every operation remains
non-runnable. The provider operation queue plan records deterministic future
queue ordering and dependencies while preserving zero queued, persisted, or
runnable operations. The provider operation queue admission review records the
next blocked admission layer for those queue items without admitting,
persisting, enqueueing, or running them.

## Bundle Contents

The ZIP contains:

- `manifest.json`
- `intent-redacted.yml`
- `plan.json`
- `live-discovery-contract.json`
- `discovery-reconciliation.json`
- `readiness.json`
- `image-sources.json`
- `node-imaging-plan.json`
- `cluster-formation-plan.json`
- `post-create-validation-plan.json`
- `network-manifest.json`
- `secret-references.json`
- `secret-resolution-plan.json`
- `secret-store-binding-review.json`
- `secret-store-provider-contract-review.json`
- `secret-lease-execution-review.json`
- `secret-audit-persistence-review.json`
- `execution-graph.json`
- `adapter-contracts.json`
- `provider-adapters.json`
- `provider-preflight.json`
- `adapter-readiness.json`
- `deployment-policy.json`
- `deployment-scheduler-review.json`
- `deployment-type-support-review.json`
- `deployment-wave-authorization-review.json`
- `deployment-window-reservation-review.json`
- `deployment-wave-gates-review.json`
- `deployment-wave-rehearsal.json`
- `provider-operation-admission-review.json`
- `provider-operation-catalog.json`
- `provider-operation-queue-admission-review.json`
- `provider-operation-queue-plan.json`
- `provider-topology-matrix.json`
- `evidence-packs.json`
- `evidence-pack-approval-review.json`
- `execution-admission-review.json`
- `execution-adapter-contract.json`
- `execution-request-review.json`
- `dry-run-ledger.json`
- `execution-permit-review.json`
- `execution-lock-plan.json`
- `execution-audit-plan.json`
- `execution-retention-plan.json`
- `execution-runner-readiness.json`
- `controlled-uat-entry-review.json`
- `controlled-uat-entry-issuance-review.json`
- `controlled-uat-hardware-reservation-review.json`
- `controlled-uat-lane-selection-review.json`
- `controlled-uat-operations-review.json`
- `controlled-uat-runbook-review.json`
- `controlled-uat-security-review.json`
- `controlled-uat-signoff-review.json`
- `controlled-uat-start-readiness-review.json`
- `controlled-uat-runner-admission-review.json`
- `controlled-uat-execution-authorization-review.json`
- `controlled-uat-completion-review.json`
- `controlled-uat-scope-review.json`
- `uat-evidence-acceptance-review.json`
- `recovery-plan.json`
- `job-state-plan.json`
- `restart-resume-review.json`
- `backup-restore-review.json`
- `mutating-enablement-review.json`
- `mutating-adapter-binding-review.json`
- `execution-submission-review.json`
- `queue-persistence-review.json`
- `adapter-uat-rehearsal.json`
- `adapter-activation-review.json`
- `adapter-enablement-review.json`
- `adapter-allow-list-review.json`
- `adapter-load-plan-review.json`
- `adapter-package-provenance-review.json`
- `adapter-sbom-review.json`
- `adapter-runtime-isolation-review.json`
- `adapter-runtime-admission-review.json`
- `adapter-execution-preflight-review.json`
- `adapter-target-connectivity-review.json`
- `adapter-credential-handoff-review.json`
- `adapter-command-invocation-review.json`
- `adapter-output-evidence-review.json`
- `retained-evidence-export-review.json`
- `resume-checkpoint.json`
- `adapter-promotion-review.json`
- `uat-checklist.json`
- `SHA256SUMS`

The manifest records `packetId`, `planId`, `intentSha256`, `discoverySha256`,
optional approval/evidence bindings, adapter contract version, artifact names,
artifact hashes, summary counts, and `nativeFoundationGateSummary`. Summary
counts include provider/topology matrix rows, provider operation catalog rows,
operation counts, provider operation admission records, missing matrix evidence,
provider operation queue items, and the zero mutating-enabled matrix row,
admitted-operation, queue-admission, queued-operation, persisted-queue, and
runnable-operation counts. The gate summary surfaces provider/topology matrix
status, provider operation catalog status, provider operation admission status,
provider operation queue plan status, provider operation queue admission
status, adapter output evidence status, retained evidence export status,
controlled UAT completion status and requirement counts, source prerequisite
status, artifact counts, and the disabled output/export/mutating-execution
flags so an operator can review packet readiness before opening every artifact.

## Redaction

The exported intent redacts keys whose names indicate secrets, tokens, API keys,
passwords, or credential material. The `secret-references.json` artifact reports
named credential references and inline secret findings by YAML path only; it
does not contain resolved credential values. Operators should still review the
packet before sharing it outside the controlled environment.

## Boundary

The review packet is an evidence and approval artifact only. It does not approve
promotion, run UAT, call hardware, image nodes, create clusters, or enable any
native Foundation execution adapter.

Use the workflow screen's Capture Evidence action to store the review packet
manifest and artifact hashes as a Validation Evidence record. Capture Evidence
stores the selected phase and optional approval ID in the packet manifest; the
new Validation Evidence record ID is the `evidenceId` used by later approval,
admission, request, recovery, and job-state reviews. The stored record carries
the manifest's authorization-persistence gate metadata and controlled UAT
completion gate metadata so later reviews can inspect the captured gate state
without unpacking every artifact. The stored record uses the redacted intent,
not raw secret-bearing YAML.

After capture, use Approval Binding Review to compare the stored evidence record
and an approved `native-foundation-deploy` approval request against the current
intent. Matching evidence and approval records still do not enable execution;
they only prove the approval package is internally consistent.
