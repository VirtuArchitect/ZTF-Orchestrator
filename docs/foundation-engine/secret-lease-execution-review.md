# Native Foundation Secret Lease Execution Review

Current release marker: `v1.8.0`.

The secret lease execution review declares the lease records a future native
Foundation adapter run would need before resolving provider or BMC credential
references. It is read-only and does not authenticate to a secret store, open
leases, read paths, resolve values, persist audit events, hand credentials to
adapters, revoke live leases, or submit jobs.

## Endpoint

```http
POST /api/native-foundation/secrets/lease-execution-review
```

Accepted inputs:

- `content` or `configContent`: native Foundation YAML intent.
- `approvalId` / `approval_id`: optional approval reference.
- `evidenceId` / `evidence_id`: optional Validation Evidence reference.
- `phase`: optional execution phase, defaulting to `full_deployment`.
- `leaseOwner` / `lease_owner`: future lease execution owner metadata.
- `leasePolicyRef` / `lease_policy_ref`: private lease policy reference.
- `auditSinkRef` / `audit_sink_ref`: private audit sink reference.
- `adapterIdentityRef` / `adapter_identity_ref`: private adapter identity
  reference.
- `leaseRevocationRef` / `lease_revocation_ref`: private lease revocation
  reference.

## Review Output

The response includes:

- `leaseExecutionReviewId`: deterministic review ID.
- `bindingReviewId`: source secret-store binding review ID.
- `providerContractReviewId`: source secret-store provider contract review ID.
- `leaseExecutionRecords`: one review record per declared secret binding.
- `reviewMetadata`: owner, policy, audit sink, adapter identity, and revocation
  references.
- `checks`: source review, metadata, lease-opening, audit-persistence,
  handoff, and mutating-job blocks.
- `summary`: lease record count and zero counts for opened leases, resolved
  secrets, exposed values, persisted audit events, adapter handoffs, and
  revocations.

Every lease record is marked `leaseStatus: not_opened`,
`secretResolutionStatus: not_resolved`, `auditPersistenceStatus:
not_persisted`, `secretValueExposed: false`, and `mutatingActionsEnabled:
false`.

## Boundary

This review prepares the control evidence needed before a future secret-store
integration can enter controlled UAT. It does not prove secret-store
reachability, credential availability, RBAC enforcement, audit persistence, or
adapter access. Enabling lease execution requires an explicit future enablement
path with scoped provider contracts, RBAC, lease revocation, redaction,
controlled UAT signoff, and release documentation.
