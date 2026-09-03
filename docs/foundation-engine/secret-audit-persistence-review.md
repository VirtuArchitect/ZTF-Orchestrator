# Native Foundation Secret Audit Persistence Review

Current release marker: `v1.8.0`.

The secret audit persistence review declares the audit event records a future
native Foundation adapter run would need before opening secret leases or handing
credentials to adapters. It is read-only and does not append audit events, write
retained artifacts, read retained secret material, classify live failures, or
submit jobs.

## Endpoint

```http
POST /api/native-foundation/secrets/audit-persistence-review
```

Accepted inputs:

- `content` or `configContent`: native Foundation YAML intent.
- `approvalId` / `approval_id`: optional approval reference.
- `evidenceId` / `evidence_id`: optional Validation Evidence reference.
- `phase`: optional execution phase, defaulting to `full_deployment`.
- `auditOwner` / `audit_owner`: future secret audit owner metadata.
- `auditPolicyRef` / `audit_policy_ref`: private audit policy reference.
- `auditSinkRef` / `audit_sink_ref`: private audit sink reference.
- `auditRetentionRef` / `audit_retention_ref`: private audit retention
  reference.
- `auditFailureRef` / `audit_failure_ref`: private failure-classification
  reference.

## Review Output

The response includes:

- `auditPersistenceReviewId`: deterministic review ID.
- `leaseExecutionReviewId`: source secret lease execution review ID.
- `auditEventRecords`: one review record per declared lease execution record.
- `reviewMetadata`: owner, policy, sink, retention, and failure references.
- `checks`: source lease review, metadata, redaction, audit append,
  persistence, retained-artifact read, and mutating-job blocks.
- `summary`: audit record count and zero counts for appended events, persisted
  events, written retention artifacts, persisted failure classifications, and
  exposed secret values.

Every audit record is marked `auditMode: review_only`,
`auditPersistenceStatus: not_persisted`, `retentionStatus: not_persisted`,
`failureClassificationStatus: not_run`, `secretValueExposed: false`, and
`mutatingActionsEnabled: false`.

## Boundary

This review prepares the control evidence needed before a future secret-store
integration can enter controlled UAT. It does not prove audit sink reachability,
immutability, retention enforcement, failure classification, credential
availability, or adapter access. Enabling secret audit persistence requires an
explicit future enablement path with immutable audit sinks, retention controls,
redaction evidence, rollback and recovery evidence, controlled UAT signoff, and
release documentation.
