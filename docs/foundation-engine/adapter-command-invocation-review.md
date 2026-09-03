# Native Foundation Adapter Command Invocation Review

Current release marker: `v1.8.0`.

Adapter command invocation review records the owner, private command catalog
reference, invocation policy reference, execution identity reference, and output
capture reference plus controlled UAT completion, retained evidence export, and
secret-audit prerequisite status plus packet output/export gate summaries that a
future native Foundation adapter would need before ZTF-Orchestrator could
assemble or invoke adapter commands.

This capability cannot assemble command lines, write command files, stage
adapter input, invoke adapters, start adapter processes, open target
connections, resolve secrets, capture live command output, submit mutating
native Foundation jobs, or mutate infrastructure.

## API

```text
POST /api/native-foundation/adapters/command-invocation-review
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
  "commandOwner": "platform-owner",
  "commandCatalogRef": "private-command-catalogs/native-foundation-hci",
  "invocationPolicyRef": "private-invocation-policies/native-foundation-safe-start",
  "executionIdentityRef": "private-identities/native-foundation-runner",
  "outputCaptureRef": "private-output-capture/native-foundation-redacted"
}
```

Valid intent returns `200` with a blocked read-only command invocation review.
Invalid intent returns `400`.

## Invocation Entries

Each `commandInvocationEntries` item includes:

- Deterministic command invocation entry ID.
- Source credential handoff, target connectivity, execution preflight, runtime
  admission, and runtime isolation entry IDs.
- Provider, deployment type, provider adapter ID, site names, cluster names,
  phase, and derived command action.
- Command owner, catalog, invocation policy, execution identity, and output
  capture metadata.
- Controlled UAT completion requirement and status inherited from credential
  handoff.
- Required review artifact names.
- Required prerequisite artifact names inherited from credential handoff, target
  connectivity, execution preflight, runtime admission, runtime isolation, SBOM,
  and package provenance review.
- Source review status for credential handoff, target connectivity,
  secret-store provider contract, controlled UAT completion, retained evidence
  export, secret audit persistence, and packet output/export gates.
- Packet gate summary counts inherited from matched approval and validation
  evidence review packets.
- Blocked command and mutating operations.
- `commandAssemblyStatus: not_assembled`.
- `commandInvocationStatus: not_invoked`.
- `outputCaptureStatus: not_started`.
- `commandAssembled: false`.
- `commandFileWritten: false`.
- `adapterInvoked: false`.
- `adapterProcessStarted: false`.
- `targetConnectionsOpened: false`.
- `secretsResolved: false`.
- `commandOutputCaptured: false`.
- `canAssembleCommand: false`.
- `canWriteCommandFile: false`.
- `canInvokeAdapter: false`.
- `canStartAdapterProcess: false`.
- `canOpenTargetConnections: false`.
- `canResolveSecrets: false`.
- `canCaptureCommandOutput: false`.
- `canSubmitMutatingJob: false`.
- `mutatingActionsEnabled: false`.

The review ties command invocation entries to adapter credential handoff review,
adapter target connectivity review, adapter execution preflight review, adapter
runtime admission review, retained evidence export review, secret audit
persistence review, controlled UAT completion review, execution permit review,
and matching approval/evidence packet gate summaries. References are checked as
metadata only; no command is assembled, written, invoked, or captured.

## Metadata

The optional metadata fields are reviewed as text only:

- `commandOwner`
- `commandCatalogRef`
- `invocationPolicyRef`
- `executionIdentityRef`
- `outputCaptureRef`
- `approvalId`
- `evidenceId`

Supplying these values can clear the corresponding metadata checks. Command
assembly, command file writes, adapter invocation, process start, target
connectivity, secret resolution, live output capture, and mutating job
submission remain blocked.

## Boundary

Adapter command invocation review cannot create approval records, assemble
commands, write command files, stage adapter inputs, invoke adapters, start
processes, open target connections, resolve secrets, capture live output,
export retained evidence, persist secret audit entries, submit jobs, replay
queues, or mutate infrastructure.

A future command invocation path must be an explicit enablement change with
signed command catalogs, reviewed invocation policies, approved execution
identity, credential handoff controls, target connectivity evidence, packet
output/export gate evidence, output redaction tests, secret audit persistence
controls, release documentation, and controlled hardware UAT evidence.
