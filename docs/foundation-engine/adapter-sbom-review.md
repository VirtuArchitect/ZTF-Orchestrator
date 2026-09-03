# Native Foundation Adapter SBOM Review

Current release marker: `v1.8.0`.

Adapter SBOM review records the SBOM owner, private SBOM reference, SBOM
format, SBOM SHA256 digest, private vulnerability scan reference, retained
evidence export prerequisite status, controlled UAT completion requirement,
and upstream secret-audit prerequisite status plus packet output/export gate
summaries required before a future native Foundation adapter package approval
path can move toward controlled UAT.

This capability cannot read adapter packages, generate SBOMs, read SBOM files,
parse component inventories, run vulnerability scans, evaluate vulnerability
gates, stage packages, import adapter code, instantiate adapters, hand
credentials to adapters, or start runners.

## API

```text
POST /api/native-foundation/adapters/sbom-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "providerId": "manual_static",
  "deploymentType": "hci",
  "phase": "full_deployment",
  "approvalId": "<optional approval id>",
  "evidenceId": "<optional validation evidence id>",
  "sbomOwner": "security-owner",
  "sbomRef": "private-sboms/manual-static-hci-1.0.0.cdx.json",
  "sbomFormat": "cyclonedx_json",
  "sbomSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "vulnerabilityScanRef": "private-scans/manual-static-hci-1.0.0-vulnscan"
}
```

Valid intent returns `200` with a blocked read-only SBOM review. Invalid intent
returns `400`.

Supported `sbomFormat` values are:

- `cyclonedx_json`
- `cyclonedx_xml`
- `spdx_json`
- `spdx_tag_value`

## SBOM Entries

Each `sbomEntries` item includes:

- Deterministic SBOM entry ID.
- Source package provenance and adapter load-plan entry IDs.
- Provider, deployment type, and provider adapter ID.
- SBOM owner and private SBOM reference.
- SBOM format and SHA256 metadata.
- Private vulnerability scan reference.
- Controlled UAT completion requirement and status inherited from package
  provenance.
- Required review artifact names.
- Required prerequisite artifact names inherited from package provenance.
- Source review status for package provenance, controlled UAT completion,
  retained evidence export, and secret audit persistence.
- Inherited adapter request packet gate counts, step audit event counts, adapter
  output evidence status, retained evidence export review status, and adapter
  command invocation status when `approvalId` and `evidenceId` bind to the same
  review packet.
- Blocked mutating operations.
- `canReadAdapterPackage: false`.
- `canGenerateSbom: false`.
- `canReadSbom: false`.
- `canRunVulnerabilityScan: false`.
- `canLoadAdapter: false`.
- `mutatingActionsEnabled: false`.

The review ties SBOM entries to adapter package provenance review, adapter load
plan review, controlled UAT signoff review, controlled UAT completion review,
retained evidence export review, secret audit persistence review, and packet
output/export gate summary. The SHA256 value is format-checked only; the SBOM
is not read or hashed.

## Metadata

The optional metadata fields are reviewed as text only:

- `sbomOwner`
- `sbomRef`
- `sbomFormat`
- `sbomSha256`
- `vulnerabilityScanRef`

Supplying these values can clear the corresponding metadata checks, including
the SHA256 format check when the digest is 64 hexadecimal characters. SBOM
generation, SBOM reads, component inventory parsing, vulnerability scanning,
package staging, adapter import, adapter instantiation, credential handoff, and
runner start remain blocked.

## Boundary

Adapter SBOM review cannot open package paths, read archives, generate an SBOM,
open SBOM files, parse components, hash SBOM bytes, call scanners, evaluate
vulnerability exceptions, copy packages, stage runtime files, import modules,
instantiate adapters, register runtime hooks, open secret leases, hand
credentials to adapters, start runners, call Foundation, contact Prism Element,
contact BMCs, export retained evidence, persist secret audit entries, or mutate
infrastructure.

A future SBOM and vulnerability review path must be an explicit enablement
change with isolated package staging, approved scanner configuration, SBOM
retention, vulnerability exception handling, controlled UAT signoff, secret
audit persistence controls, secret handoff controls, operator runbooks, release
documentation, and controlled hardware UAT evidence.
