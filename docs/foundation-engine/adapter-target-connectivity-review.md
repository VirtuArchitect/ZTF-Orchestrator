# Native Foundation Adapter Target Connectivity Review

Current release marker: `v1.8.0`.

Adapter target connectivity review records the owner, private connectivity
scope reference, target allow-list reference, maintenance window reference, and
probe plan reference plus controlled UAT completion, retained evidence export,
and secret-audit prerequisite status plus packet output/export gate summaries
that a future native Foundation adapter would need before it could open
Foundation, Prism Element, BMC, or hardware provider connections.

This capability cannot open sockets, authenticate to targets, resolve secrets,
send reachability probes, call Foundation, contact Prism Element, contact BMCs,
contact hardware providers, submit mutating native Foundation jobs, or mutate
infrastructure.

## API

```text
POST /api/native-foundation/adapters/target-connectivity-review
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
  "connectivityOwner": "network-owner",
  "connectivityScopeRef": "private-connectivity-scopes/DCU1-foundation-targets",
  "targetAllowlistRef": "private-allowlists/native-foundation-targets",
  "maintenanceWindowRef": "private-windows/CHG-4001",
  "probePlanRef": "private-probe-plans/foundation-targets-readiness"
}
```

Valid intent returns `200` with a blocked read-only target connectivity review.
Invalid intent returns `400`.

## Connectivity Entries

Each `targetConnectivityEntries` item includes:

- Deterministic target connectivity entry ID.
- Source execution preflight, runtime admission, runtime isolation, SBOM,
  package provenance, and load-plan entry IDs.
- Provider, deployment type, provider adapter ID, site names, cluster names, and
  phase.
- Connectivity owner, connectivity scope, target allow-list, maintenance
  window, and probe plan metadata.
- Controlled UAT completion requirement and status inherited from execution
  preflight.
- Required review artifact names.
- Required prerequisite artifact names inherited from execution preflight,
  runtime admission, runtime isolation, SBOM, and package provenance review.
- Source review status for execution preflight, runtime admission, runtime
  isolation, SBOM, package provenance, controlled UAT completion, retained
  evidence export, and secret audit persistence, and packet output/export gates.
- Packet gate summary counts inherited from matched approval and validation
  evidence review packets.
- Blocked target connectivity operations.
- `targetConnectionStatus: not_opened`.
- `foundationProbeStatus: not_run`.
- `prismElementProbeStatus: not_run`.
- `bmcProbeStatus: not_run`.
- `hardwareProviderProbeStatus: not_run`.
- `targetConnectionsOpened: false`.
- `foundationReachabilityProbed: false`.
- `prismElementReachabilityProbed: false`.
- `bmcReachabilityProbed: false`.
- `hardwareProviderReachabilityProbed: false`.
- `secretsResolved: false`.
- `canOpenTargetConnections: false`.
- `canProbeFoundation: false`.
- `canProbePrismElement: false`.
- `canProbeBmc: false`.
- `canProbeHardwareProvider: false`.
- `canResolveSecrets: false`.
- `canSubmitMutatingJob: false`.
- `mutatingActionsEnabled: false`.

The review ties target connectivity entries to adapter execution preflight
review, adapter runtime admission review, adapter runtime isolation review,
adapter SBOM review, secret audit persistence review, secret-store binding
review, controlled UAT completion review, retained evidence export review,
secret-store provider contract review, execution permit review, and matching
approval/evidence packet gate summaries. References are checked as metadata
only; no connection is opened and no live reachability is tested.

## Metadata

The optional metadata fields are reviewed as text only:

- `connectivityOwner`
- `connectivityScopeRef`
- `targetAllowlistRef`
- `maintenanceWindowRef`
- `probePlanRef`
- `approvalId`
- `evidenceId`

Supplying these values can clear the corresponding metadata checks. Target
connection opening, live reachability probes, secret resolution, Foundation
calls, Prism Element calls, BMC contact, hardware provider contact, adapter
preflight execution, and mutating job submission remain blocked.

## Boundary

Adapter target connectivity review cannot create approval records, open sockets,
authenticate to targets, resolve secrets, hand credentials to adapters, send
packets, run probes, call Foundation, contact Prism Element, contact BMCs,
contact hardware providers, export retained evidence, persist secret audit
entries, submit jobs, replay queues, or mutate infrastructure.

A future target connectivity path must be an explicit enablement change with
scoped allow-lists, approved secret leases, secret audit persistence controls,
packet output/export gate evidence, maintenance windows, probe plans, rollback
evidence, network ownership, release documentation, and controlled hardware UAT
evidence.
