# Native Foundation Adapter Credential Handoff Review

Current release marker: `v1.8.0`.

Adapter credential handoff review records the owner, private credential handoff
reference, secret lease policy reference, adapter identity reference, and
redaction policy reference plus controlled UAT completion, retained evidence
export, and secret-audit prerequisite status plus packet output/export gate
summaries that a future native Foundation adapter would need before credentials
could be handed to adapter runtime code.

This capability cannot open secret leases, authenticate to secret providers,
resolve secrets, decrypt values, expose secret material, hand credentials to
adapters, open target connections, submit mutating native Foundation jobs, or
mutate infrastructure.

## API

```text
POST /api/native-foundation/adapters/credential-handoff-review
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
  "handoffOwner": "security-owner",
  "credentialHandoffRef": "private-handoffs/native-foundation-adapters",
  "secretLeasePolicyRef": "private-secret-policies/short-lived-native-foundation",
  "adapterIdentityRef": "private-identities/native-foundation-runner",
  "redactionPolicyRef": "private-redaction/native-foundation-logs"
}
```

Valid intent returns `200` with a blocked read-only credential handoff review.
Invalid intent returns `400`.

## Handoff Entries

Each `credentialHandoffEntries` item includes:

- Deterministic credential handoff entry ID.
- Source target connectivity, execution preflight, runtime admission, and
  runtime isolation entry IDs.
- Provider, deployment type, provider adapter ID, site names, cluster names, and
  phase.
- Handoff owner, credential handoff reference, lease policy, adapter identity,
  and redaction policy metadata.
- Credential binding and credential reference counts.
- Controlled UAT completion requirement and status inherited from target
  connectivity.
- Required review artifact names.
- Required prerequisite artifact names inherited from target connectivity,
  execution preflight, runtime admission, runtime isolation, SBOM, and package
  provenance review.
- Source review status for target connectivity, secret-store provider contract,
  controlled UAT completion, retained evidence export, secret audit
  persistence, and packet output/export gates.
- Packet gate summary counts inherited from matched approval and validation
  evidence review packets.
- Blocked credential and mutating operations.
- `secretLeaseStatus: not_opened`.
- `credentialHandoffStatus: not_performed`.
- `secretValuesResolved: false`.
- `secretValuesExposed: false`.
- `credentialsHandedToAdapter: false`.
- `adapterIdentityVerified: false`.
- `redactionPolicyApplied: false`.
- `targetConnectionsOpened: false`.
- `canOpenSecretLease: false`.
- `canResolveSecrets: false`.
- `canHandoffCredentialsToAdapter: false`.
- `canExposeSecretValues: false`.
- `canOpenTargetConnections: false`.
- `canSubmitMutatingJob: false`.
- `mutatingActionsEnabled: false`.

The review ties credential handoff entries to adapter target connectivity
review, adapter execution preflight review, secret-store binding review,
secret-store provider contract review, controlled UAT completion review,
retained evidence export review, secret audit persistence review, execution
permit review, and matching approval/evidence packet gate summaries. References
are checked as metadata only; no lease is opened and no credential value is
resolved or handed to adapter code.

## Metadata

The optional metadata fields are reviewed as text only:

- `handoffOwner`
- `credentialHandoffRef`
- `secretLeasePolicyRef`
- `adapterIdentityRef`
- `redactionPolicyRef`
- `approvalId`
- `evidenceId`

Supplying these values can clear the corresponding metadata checks. Secret
lease opening, secret resolution, decryption, credential handoff, adapter
identity verification, target connectivity, adapter preflight execution, and
mutating job submission remain blocked.

## Boundary

Adapter credential handoff review cannot create approval records, authenticate
to secret providers, open leases, resolve secrets, decrypt values, expose secret
material, log secrets, hand credentials to adapters, start adapter processes,
open target connections, export retained evidence, persist secret audit
entries, submit jobs, replay queues, or mutate infrastructure.

A future credential handoff path must be an explicit enablement change with
approved secret leases, adapter identity, redaction tests, audit persistence,
packet output/export gate evidence, recovery controls, release documentation,
and controlled hardware UAT evidence.
