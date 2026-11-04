# Cluster storage standard implementation review

Scope: new native storage adapter, dedicated admin review/execute routes, durable
jobs, exact-content approvals and workflow UI. No new dependency, persistence
schema or change to existing CreateContainerPe/DeleteContainerPe behavior.

- Admin role enforced by API and route guard; workflow approval cannot be disabled.
- Independent expiring approval binds exact YAML/filename and one job. Worker
  validation shares the submission lock, and approval is rechecked before writes.
- No script alias or pipeline/schedule integration. Existing approval automation
  rejection applies to this mandatory-approval workflow.
- YAML safe loading, bounded content, strict allowlist, exactly three distinct
  replacement names, safe identifiers and stored credential references.
- Strict HTTPS and trusted certificates; redirects and inherited proxies disabled.
  Response sizes bounded; errors never return raw target bodies or credentials.
- Cluster UUID and default name/UUID bound at review and rechecked. No wildcard
  deletion, system-container deletion or selection of an arbitrary storage pool.
- Full inventory counts required. VDisk ownership evidence gates default cleanup;
  the PE's normal deletion guard remains enabled. No forced disk cleanup, mutation
  retries or automatic rollback. Partial changes require operator reconciliation.
- Tests cover approval/role/replay gates, simulated durable execution, lifecycle
  ordering, identity changes, ambiguous/missing/truncated inventory, setting
  mismatches, dependencies, cancellation and failure verification.

Residual boundaries: no live PE calls; certificate trust and exact response shapes
need lab compatibility validation. Concurrent external administrative changes are
not transactional; PE enforces dependencies at deletion. Stored credentials are
sent only to the administrator-selected target. Broad existing diagnostics and
legacy deletion behavior are unchanged. Development dependency findings remain
outside this focused change; production audit reports no vulnerabilities.
