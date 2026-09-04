# Native Foundation UAT Evidence Acceptance Review

Current release marker: `v1.8.1`.

The UAT evidence acceptance review summarizes whether the selected native
Foundation provider and deployment-type requirements have accepted evidence IDs
under `foundation_engine.uat_evidence`.

This capability does not persist acceptance decisions or enable deployment.

## API

```text
POST /api/native-foundation/uat/evidence-acceptance-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "providerId": "<optional provider scope>",
  "deploymentType": "<optional deployment type scope>",
  "approvalId": "<optional approved native Foundation request id>",
  "evidenceId": "<optional Validation Evidence packet id>"
}
```

Valid intent returns `200` with a read-only review. Invalid intent returns
`400`.

## Review Output

The response includes:

- `acceptanceReviewId`.
- `status`, which is `ready_for_review` only when matching evidence packs exist,
  all required UAT evidence records are accepted with evidence IDs, and both
  `approvalId` and `evidenceId` are supplied.
- `canAcceptUatEvidence: false`.
- `canEnableExecution: false`.
- Evidence catalog entries derived from `foundation_engine.uat_evidence`.
- Acceptance records mapping provider/deployment requirements to evidence keys.
- Summary counts for selected packs, catalog records, required evidence,
  accepted evidence, missing evidence, approval binding, and accepted-for-
  execution count.

## Evidence Mapping

The review reuses the native Foundation evidence alias map. Examples:

- `provider_discovery_uat`, `redfish_discovery_uat`, `api_scope_review`, and
  `hardware_support_record` map to `hardware_provider_discovery`.
- `power_boot_uat` maps to `network_path_verified`.
- `imaging_uat` maps to `image_source_verified`.
- `cluster_create_uat`, `hci_cluster_create_uat`, and
  `prism_element_validation` map to `cluster_create_validated`.
- `compute_registration_uat` maps to `compute_registration_validated`.
- `storage_cluster_uat` maps to `storage_cluster_validated`.
- `plan_hash_approval` maps to `approval_binding_review`.
- `readiness_gate_review` and `execution_graph_review` map to
  `recovery_runbook_reviewed`.

## Boundary

The review cannot accept evidence, create Validation Evidence records, approve
UAT, issue UAT entry, enable adapters, submit mutating jobs, call Foundation,
call Prism Element, contact hardware providers, or mutate hardware.

Controlled UAT signoff review consumes this artifact and requires it to be
`ready_for_review` before the signoff dependency chain can clear the UAT
evidence prerequisite. Signoff persistence, UAT entry issuance, adapter loading,
and execution still remain disabled until a future explicit enablement path is
implemented and validated.
