# Configuration-file grouping review

Scope: v1.8.5-rc1 source changes for config labels, shared group catalogue reads
and workflow/pipeline config selection. No infrastructure deployment performed.

## Reviewed controls

- GET requires an authenticated admin, operator or viewer. PUT requires admin or
  operator, matching existing configuration-edit permissions. Catalogue management
  remains administrator-only; no credential endpoint authorization was widened.
- The new response deliberately exposes non-secret group definitions to config
  readers. It excludes credential assignments and values. This is organization,
  not a tenant boundary or automatic authorization to execute configurations.
- The fixed metadata document key cannot be selected by a client. Assignment keys
  reject path separators, controls, invalid extensions and excessive lengths.
  Changed assignments require an existing config file and a valid group ID.
- Strict metadata keys exclude secret-bearing fields. Purposes use a fixed enum.
  Existing-file metadata parse failures fail closed rather than resetting state.
- Stale revisions and removed group IDs reject writes. Group-catalogue reads and
  updates share the existing in-process lock. As with credential grouping, this
  is not a new cross-process transaction guarantee for multi-worker deployments.
- Atomic document persistence uses the existing file/PostgreSQL backend. No
  schema migration, runtime dependency, shell command or target mutation added.
- Group removal leaves orphaned config labels readable as Ungrouped, without
  rewriting file content, approvals or execution records. Existing references
  remain selected even outside the active UI filter.
- Saved workflow import reuses the existing size, safe YAML parsing and schema
  checks. It confirms replacement of form drafts, does not execute, and retains
  the normal exact-content approval and execution paths.
- React renders labels as escaped text. Search excludes config contents and
  credential values. Audit logs record actor/action/count only, not label text,
  config contents or secrets. The demo remains simulated.

## Verification and limits

Focused API tests cover unauthorized requests, viewer/operator boundaries,
malformed inputs, path traversal, corrupt metadata, stale revisions, missing
files, removed groups and unchanged config/dependent-document bytes. Browser
checks cover grouping persistence, inherited create/upload labels, selected-file
retention, workflow import validation, failed label saves and mobile layout.
Existing credential and cluster-config browser regression checks pass.

No live appliance database migration, Docker cutover, GitHub publication or
physical infrastructure action was performed. Existing distributed metadata
write limitations remain; this change does not add multi-worker coordination.
