# Native Foundation Review Job

Current release marker: `v1.8.0`.

The native Foundation review job queues a durable, read-only rehearsal through
the existing Jobs / Queue worker. It validates the deployment intent, generates
the review packet, provider/topology matrix, provider operation catalog,
provider operation admission review, provider operation queue plan, provider
operation queue admission review, execution request review, dry-run ledger,
permit review, lock plan, audit plan, retention plan, runner readiness,
secret-store binding review,
secret-store provider contract review, secret lease execution review,
secret audit persistence review, adapter allow-list review, adapter load plan review, adapter package
provenance review, adapter SBOM review, adapter runtime isolation review,
adapter runtime admission review, adapter execution preflight review,
adapter target connectivity review, adapter credential handoff review,
adapter command invocation review, adapter output evidence review, retained
evidence export review, controlled UAT entry review, controlled UAT scope review, controlled UAT runbook review,
controlled UAT security review, controlled UAT operations review, controlled
UAT signoff review, UAT evidence acceptance review, recovery plan, job state
plan, restart/resume review, backup/restore review, mutating enablement review,
execution submission review, queue persistence review, mutating adapter binding
review, controlled UAT lane selection review, and controlled UAT lane
persistence admission review, then stores normal job logs and execution
history.

This capability does not deploy infrastructure.

## API

```text
POST /api/native-foundation/execution/review-job
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "configFile": "native-foundation-deploy.yml",
  "phase": "full_deployment",
  "approvalId": "<optional approved native Foundation request id>",
  "evidenceId": "<optional Validation Evidence packet id>"
}
```

Valid intent returns `202` with a queued durable job. Invalid intent returns
`400` and does not create a queue record.

When `approvalId` and `evidenceId` are supplied, the queued job trace records
them and the generated review packet, request review, recovery plan, and job
state plan inherit the same packet output/export gate summaries.

## Job Behavior

The worker emits persisted logs for:

- Native Foundation plan ID.
- Intent and discovery SHA256 hashes.
- Optional approval/evidence bindings.
- Review packet ID.
- Provider/topology matrix row count, provider count, deployment type count,
  missing evidence count, and zero mutating-enabled row count.
- Provider operation catalog row count, operation count, mutating-operation
  count, and zero runnable-operation count.
- Provider operation admission record count, admitted-operation count, and zero
  runnable-operation count.
- Provider operation queue item count, queued-operation count, persisted-queue
  count, and zero runnable-operation count.
- Provider operation queue admission record count, admitted-queue count,
  persisted-queue count, queued-operation count, and zero runnable-operation
  count.
- Execution request ID.
- Dry-run ledger ID and entry count.
- Execution permit ID and issued count.
- Execution lock plan ID and lock count.
- Execution audit plan ID and event count.
- Execution retention plan ID and backup target count.
- Restart/resume review ID and replay record count.
- Backup/restore review ID, backup record count, and restore-tested count.
- Runner readiness ID and blocked item count.
- UAT evidence acceptance review ID, accepted evidence count, and missing
  evidence count.
- Mutating enablement review ID, enabled mutating submission count, and blocked
  enablement item count.
- Execution submission review ID, submission record count, enqueued job count,
  and enabled mutating submission count.
- Queue persistence review ID, queue record count, persisted queue record count,
  and replay registration count.
- Mutating adapter binding review ID, binding record count, provider operation
  queue admission count, persisted binding count, and adapter execution count.
- Controlled UAT lane selection review ID, lane record count, provider
  operation queue admission count, persisted selection count, and issued UAT
  entry count.
- Controlled UAT lane persistence admission review ID, admission record count,
  provider operation queue admission count, admitted lane count, and hardware
  reservation admission count.
- Controlled UAT reservation persistence admission review ID, admission record
  count, provider operation queue admission count, admitted reservation count,
  and opened maintenance window count.
- Controlled UAT entry issuance review ID, issuance record count, provider
  operation queue admission count, persisted entry count, and issued entry
  count.
- Controlled UAT entry persistence admission review ID, admission record count,
  provider operation queue admission count, admitted entry count, and issued
  entry count.
- Controlled UAT start readiness review ID, start record count, provider
  operation queue admission count, UAT start count, and runner-start count.
- Controlled UAT start persistence admission review ID, admission record count,
  provider operation queue admission count, admitted start count, and persisted
  UAT start count.
- Controlled UAT runner admission review ID, admission record count, provider
  operation queue admission count, admitted runner count, and runner-start
  count.
- Controlled UAT runner persistence admission review ID, admission record
  count, provider operation queue admission count, admitted persistence record
  count, and persisted runner admission count.
- Secret-store binding review ID and binding count.
- Secret-store provider contract review ID and blocked check count.
- Secret lease execution review ID and lease opened count.
- Secret audit persistence review ID and persisted audit event count.
- Adapter allow-list review ID and allowed entry count.
- Adapter load plan review ID and loaded adapter count.
- Adapter package provenance review ID and verified signature count.
- Adapter SBOM review ID and vulnerability scan run count.
- Adapter runtime isolation review ID and sandbox creation count.
- Adapter runtime admission review ID and runtime admitted count.
- Adapter execution preflight review ID and adapter preflight run count.
- Adapter target connectivity review ID and target connection opened count.
- Adapter credential handoff review ID and credential handoff count.
- Adapter command invocation review ID and adapter invocation count.
- Adapter output evidence review ID and evidence persisted count.
- Retained evidence export review ID and generated export count.
- Controlled UAT entry review ID and blocked item count.
- Controlled UAT scope review ID and scope record count.
- Controlled UAT runbook review ID and runbook step count.
- Controlled UAT security review ID and blocked item count.
- Controlled UAT operations review ID and blocked item count.
- Controlled UAT signoff review ID and blocked item count.
- Job state ID.
- Evidence pack count.
- Packet gate summary counts for request, recovery, and job state.
- Recovery action count.
- State transition count.

The job exits `success` when the review-only rehearsal completes because the
review artifacts were generated successfully. This does not mean deployment was
approved, queued for mutation, or completed on hardware.

## Boundary

The review job does not call Foundation, Prism Element, provider adapters,
hardware providers, secret stores, queue replay, or checkpoint persistence. It
does not image nodes, form clusters, register compute nodes, validate live
clusters, power-cycle hardware, or alter boot state.

Use it to prove the durable job surface, persisted logs, history records, and
evidence references before enabling any scoped mutating adapter in controlled
UAT.
