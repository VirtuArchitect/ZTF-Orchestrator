# Native Foundation Adapter Runtime Isolation Review

Current release marker: `v1.8.0`.

Adapter runtime isolation review records the runtime owner, isolation profile,
sandbox image or runtime reference, network policy reference, and filesystem
policy reference plus controlled UAT completion, retained evidence export, and
upstream secret-audit prerequisite status plus packet output/export gate
summaries required before a future native Foundation adapter can be loaded in a
controlled runtime.

This capability cannot create containers, virtual machines, worker sandboxes, or
process jails. It cannot pull runtime images, mount adapter packages, apply
network or filesystem policies, register runtime hooks, import adapter code,
hand credentials to adapters, start adapter processes, start runners, call
Foundation, contact Prism Element, contact BMCs, or mutate infrastructure.

## API

```text
POST /api/native-foundation/adapters/runtime-isolation-review
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
  "runtimeOwner": "runtime-owner",
  "isolationProfile": "container_sandbox",
  "sandboxImageRef": "private-runtime-images/native-foundation-adapter-runner:1.0.0",
  "networkPolicyRef": "private-policies/native-foundation-network-egress-v1",
  "filesystemPolicyRef": "private-policies/native-foundation-readonly-fs-v1"
}
```

Valid intent returns `200` with a blocked read-only runtime isolation review.
Invalid intent returns `400`.

Supported `isolationProfile` values are:

- `process_sandbox`
- `container_sandbox`
- `vm_sandbox`
- `appliance_worker`

## Runtime Entries

Each `runtimeIsolationEntries` item includes:

- Deterministic runtime isolation entry ID.
- Source SBOM, package provenance, and adapter load-plan entry IDs.
- Provider, deployment type, and provider adapter ID.
- Runtime owner and isolation profile metadata.
- Sandbox image, network policy, and filesystem policy references.
- Controlled UAT completion requirement and status inherited from SBOM review.
- Required review artifact names.
- Required prerequisite artifact names inherited from SBOM and package
  provenance review.
- Source review status for SBOM, package provenance, controlled UAT completion,
  retained evidence export, secret audit persistence, and packet output/export
  gates.
- Packet gate summary counts inherited from matched approval and validation
  evidence review packets.
- Blocked mutating operations.
- `canCreateSandbox: false`.
- `canApplyNetworkPolicy: false`.
- `canApplyFilesystemPolicy: false`.
- `canStartAdapterProcess: false`.
- `canLoadAdapter: false`.
- `mutatingActionsEnabled: false`.

The review ties runtime isolation entries to adapter SBOM review, adapter
package provenance review, adapter load plan review, and controlled UAT signoff
review plus controlled UAT completion review, retained evidence export, secret
audit persistence, and matching approval/evidence packet gate summaries.
Runtime references are checked as metadata only; no runtime is created or
inspected.

## Metadata

The optional metadata fields are reviewed as text only:

- `runtimeOwner`
- `isolationProfile`
- `sandboxImageRef`
- `networkPolicyRef`
- `filesystemPolicyRef`
- `approvalId`
- `evidenceId`

Supplying these values can clear the corresponding metadata checks when the
profile is one of the supported values. Sandbox creation, network policy
application, filesystem policy application, runtime hook registration, adapter
import, credential handoff, adapter process start, and runner start remain
blocked.

## Boundary

Adapter runtime isolation review cannot create or inspect runtime sandboxes,
pull images, mount packages, apply network policy, apply filesystem policy,
open package paths, read archives, import modules, instantiate adapters,
register hooks, open secret leases, hand credentials to adapters, start
processes, start runners, call Foundation, contact Prism Element, contact BMCs,
export retained evidence, persist secret audit entries, or mutate
infrastructure.

A future runtime isolation path must be an explicit enablement change with a
reviewed sandbox runtime, signed package provenance, SBOM and vulnerability
evidence, packet output/export gate evidence, network and filesystem policy
controls, secret audit persistence controls, secret handoff controls,
controlled UAT signoff, operator runbooks, release documentation, and
controlled hardware UAT evidence.
