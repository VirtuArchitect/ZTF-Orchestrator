# Native Foundation Adapter Package Provenance Review

Current release marker: `v1.8.0`.

Adapter package provenance review records the package ownership, private package
reference, SHA256 digest, signature reference, and signer reference that a
future native Foundation adapter loading path would require. It carries
controlled UAT completion, retained-evidence export, upstream secret-audit
persistence, and packet output/export gate status from the adapter load plan
into each package provenance entry.

This capability cannot read adapter packages, hash files, verify signatures,
stage packages, import adapter code, instantiate adapters, hand credentials to
adapters, or start runners.

## API

```text
POST /api/native-foundation/adapters/package-provenance-review
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
  "packageOwner": "adapter-owner",
  "packageRef": "private-packages/manual-static-hci-1.0.0.zip",
  "packageSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "signatureRef": "private-signatures/manual-static-hci-1.0.0.sig",
  "signerRef": "private-signers/platform-release-key"
}
```

Valid intent returns `200` with a blocked read-only package provenance review.
Invalid intent returns `400`.

## Provenance Entries

Each `packageProvenanceEntries` item includes:

- Deterministic package provenance entry ID.
- Source adapter load-plan entry ID.
- Provider, deployment type, and provider adapter ID.
- Package owner and private package reference.
- Package SHA256 metadata.
- Signature and signer references.
- Controlled UAT completion requirement and status inherited from adapter load
  plan review.
- Required review artifact names.
- Required prerequisite artifacts.
- Source review status for adapter load plan, retained evidence export,
  controlled UAT completion, upstream secret audit persistence, and direct
  secret audit persistence.
- Inherited adapter request packet gate counts, step audit event counts, adapter
  output evidence status, retained evidence export review status, and adapter
  command invocation status when `approvalId` and `evidenceId` bind to the same
  review packet.
- Blocked mutating operations.
- `canReadAdapterPackage: false`.
- `canVerifySignature: false`.
- `canStagePackage: false`.
- `canLoadAdapter: false`.
- `mutatingActionsEnabled: false`.

The review ties package provenance entries to adapter load plan review,
controlled UAT signoff review, controlled UAT completion review,
retained-evidence export prerequisite, secret audit persistence review, packet
output/export gate summary, and adapter allow-list review. The SHA256 value is
format-checked only; the package is not read or hashed.

## Metadata

The optional metadata fields are reviewed as text only:

- `packageOwner`
- `packageRef`
- `packageSha256`
- `signatureRef`
- `signerRef`

Supplying these values can clear the corresponding metadata checks, including
the SHA256 format check when the digest is 64 hexadecimal characters. Package
reads, signature verification, package staging, adapter import, adapter
instantiation, credential handoff, and runner start remain blocked.

## Boundary

Adapter package provenance review cannot open package paths, read archives,
hash package bytes, verify signatures, scan package contents, generate an SBOM,
copy packages, stage runtime files, import modules, instantiate adapters,
register runtime hooks, open secret leases, hand credentials to adapters, start
runners, call Foundation, contact Prism Element, contact BMCs, export retained
evidence, persist secret audit entries, or mutate infrastructure.

A future package provenance path must be an explicit enablement change with
signed package provenance, isolated staging, malware scanning, SBOM review,
controlled UAT signoff, secret audit persistence controls, secret handoff
controls, operator runbooks, release documentation, and controlled hardware UAT
evidence.
