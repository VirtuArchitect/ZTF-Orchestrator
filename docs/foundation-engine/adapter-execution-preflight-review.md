# Native Foundation Adapter Execution Preflight Review

Current release marker: `v1.8.0`.

Adapter execution preflight review records the operator preflight owner, private
preflight evidence reference, adapter command reference, target connectivity
reference, rollback readiness reference, controlled UAT completion requirement,
retained evidence export prerequisite status, secret-audit prerequisite status,
and packet output/export gate summaries that a future native Foundation adapter
preflight path would need before any adapter command could run.

This capability cannot run adapter commands, resolve secrets, open target
connections, call Foundation, contact Prism Element, contact BMCs, contact
hardware providers, submit mutating native Foundation jobs, or mutate
infrastructure.

## API

```text
POST /api/native-foundation/adapters/execution-preflight-review
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
  "preflightOwner": "platform-owner",
  "preflightRef": "private-preflights/manual-static-hci-1.0.0",
  "adapterCommandRef": "private-adapter-commands/manual-static-hci-preflight",
  "targetConnectivityRef": "private-connectivity/DCU1-native-foundation",
  "rollbackReadinessRef": "private-rollback/RB-4001"
}
```

Valid intent returns `200` with a blocked read-only execution preflight review.
Invalid intent returns `400`.

## Preflight Entries

Each `executionPreflightEntries` item includes:

- Deterministic execution preflight entry ID.
- Source runtime admission, runtime isolation, SBOM, package provenance, and
  load-plan entry IDs.
- Provider, deployment type, provider adapter ID, site names, cluster names, and
  phase.
- Preflight owner, preflight reference, adapter command reference, target
  connectivity reference, and rollback readiness reference metadata.
- Controlled UAT completion requirement and status inherited from runtime
  admission.
- Required review artifact names.
- Required prerequisite artifact names inherited from runtime admission,
  runtime isolation, SBOM, and package provenance review.
- Source review status for runtime admission, runtime isolation, SBOM, package
  provenance, controlled UAT completion, retained evidence export, secret audit
  persistence, and packet output/export gates.
- Packet gate summary counts inherited from matched approval and validation
  evidence review packets.
- Blocked execution preflight operations.
- `adapterPreflightRun: false`.
- `secretsResolved: false`.
- `targetConnectionsOpened: false`.
- `foundationReachabilityChecked: false`.
- `hardwareReachabilityChecked: false`.
- `rollbackReadinessVerified: false`.
- `canRunAdapterPreflight: false`.
- `canResolveSecrets: false`.
- `canOpenTargetConnections: false`.
- `canCallFoundation: false`.
- `canContactHardware: false`.
- `canSubmitMutatingJob: false`.
- `mutatingActionsEnabled: false`.

The review ties execution preflight entries to adapter runtime admission,
adapter runtime isolation review, adapter SBOM review, adapter package
provenance review, secret audit persistence review, controlled UAT completion
review, execution permit review, retained evidence export review, runner
readiness review, and matching approval/evidence packet gate summaries.
References are checked as metadata only; no command is executed and no target
connection is opened.

## Metadata

The optional metadata fields are reviewed as text only:

- `preflightOwner`
- `preflightRef`
- `adapterCommandRef`
- `targetConnectivityRef`
- `rollbackReadinessRef`
- `approvalId`
- `evidenceId`

Supplying these values can clear the corresponding metadata checks. Adapter
preflight execution, secret resolution, Foundation connectivity, Prism Element
connectivity, BMC connectivity, hardware provider connectivity, rollback
execution, and mutating job submission remain blocked.

## Boundary

Adapter execution preflight review cannot create approval records, run adapter
commands, execute provider preflight code, resolve secrets, open target
connections, call Foundation, contact Prism Element, contact BMCs, contact
hardware providers, export retained evidence, persist secret audit entries,
submit jobs, replay queues, or mutate infrastructure.

A future execution preflight path must be an explicit enablement change with
signed adapter command definitions, secret lease controls, secret audit
persistence controls, packet output/export gate evidence, target connectivity
allow-lists, rollback readiness evidence, operator approvals, release
documentation, and controlled hardware UAT evidence.
