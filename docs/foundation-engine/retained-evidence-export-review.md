# Native Foundation Retained Evidence Export Review

Current release marker: `v1.8.1`.

The retained evidence export review declares the export package a future native
Foundation runner would need after output evidence capture and retention
planning, including the output-evidence prerequisite artifact list and upstream
source review statuses, controlled UAT completion requirement, plus inherited
packet output/export gate summaries with the retained-export self-reference
filtered out. It is read-only and does not read retained artifacts, generate
ZIP files, write checksum manifests, persist Validation Evidence, or submit
jobs.

## Endpoint

```http
POST /api/native-foundation/execution/retained-evidence-export-review
```

Accepted inputs:

- `content` or `configContent`: native Foundation YAML intent.
- `providerId` / `provider_id`: optional provider scope.
- `deploymentType` / `deployment_type`: optional deployment type scope.
- `phase`: optional execution phase, defaulting to `full_deployment`.
- `approvalId` / `approval_id`: optional approved request packet binding.
- `evidenceId` / `evidence_id`: optional validation evidence packet binding.
- `exportOwner` / `export_owner`: future export owner metadata.
- `exportRequestRef` / `export_request_ref`: private export request reference.
- `retentionStoreRef` / `retention_store_ref`: private retention store reference.
- `rbacReviewRef` / `rbac_review_ref`: private RBAC review reference.
- `checksumManifestRef` / `checksum_manifest_ref`: private checksum manifest
  reference.

## Review Output

The response includes:

- `exportReviewId`: deterministic retained evidence export review ID.
- `retentionPlanId`: source execution retention plan ID.
- `outputEvidenceReviewId`: source adapter output evidence review ID.
- `exportItems`: one review item per declared retained artifact.
- `reviewMetadata`: owner, request, retention store, RBAC, and checksum
  references.
- `requiredPrerequisiteArtifacts` and `sourceReviewStatus` on each export item:
  inherited from the adapter output evidence review without requiring
  `retained-evidence-export-review.json` from itself.
- Controlled UAT completion requirement and inherited completion status on each
  export item.
- `checks`: source review, secret audit persistence prerequisite, metadata,
  controlled UAT completion prerequisite, output-evidence prerequisite
  carry-forward, packet gate carry-forward, artifact-read, export, and
  mutating-job blocks.
- `summary`: export item count and zero counts for reads, generated ZIPs,
  checksum writes, RBAC validation, persisted evidence, and packet gate counts
  when matching approval/evidence IDs are provided.

Every export item is marked `artifactRead: false`, `includedInExport: false`,
`zipGenerated: false`, `checksumWritten: false`, and
`mutatingActionsEnabled: false`.

## Boundary

This review is an approval and readiness artifact only. It does not prove that
retained evidence exists, has been redacted, has been exported, or can be
restored. Enabling retained evidence export requires persisted artifacts, RBAC
enforcement, redaction verification, checksum generation, secret audit
persistence controls, backup/restore rehearsal, controlled UAT signoff, and
completion evidence, and release documentation.
