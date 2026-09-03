# Native Foundation UAT Checklist

Current release marker: `v1.8.0`.

The native Foundation UAT checklist turns an adapter promotion review into
read-only test cases and required evidence fields for controlled hardware UAT.
It does not run tests, approve promotion, or enable any mutating adapter.

## API

```text
POST /api/native-foundation/uat/checklist
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>",
  "providerId": "manual_static",
  "deploymentType": "hci"
}
```

`providerId` and `deploymentType` are optional only when the intent contains
exactly one provider and one deployment type. Multi-topology intents should pass
both fields to produce a scoped checklist.

## Checklist Cases

Every checklist includes:

- Intent freeze and SHA256 capture.
- Provider discovery validation.
- Image source validation.
- Network path validation.
- Stop, retry, rollback, and recovery runbook review.
- Checkpoint and resume-state review.
- Evidence redaction review.
- Promotion decision record.

Deployment-specific cases are added for HCI cluster-create, compute-only
registration, storage-only cluster formation, and mixed topology validation.

## Boundary

The response always returns `readOnly: true`,
`mutatingActionsEnabled: false`, `status: blocked`, and `canPromote: false`.
The checklist is a preparation artifact for controlled UAT, not a substitute for
running UAT on named hardware, Foundation/AOS/AHV versions, image sources,
network paths, and recovery procedures.
Use [Review Packet](review-packet.md) to download the redacted artifact bundle
for approval and UAT handoff.
