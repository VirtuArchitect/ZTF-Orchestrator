# Recovery profile lifecycle security review

Scope: administrator-only profile editing, archive/restore and unused-profile deletion, 5 November 2026.

- Existing authenticated role checks protect all new mutation routes; viewer and operator denial is tested.
- Exact typed names and nonempty bounded notes are required for lifecycle actions. Invalid control characters and unexpected fields are rejected. Notes are rendered as React text, not HTML; do not include secrets.
- Current revision and timestamp are rechecked under the shared application lock. Stale requests return 409. Existing clients may still omit version fields on the pre-existing edit API; the new UI always includes them.
- Prepared, active, reconciliation and unknown run states block edit/archive/restore. Any historical run prevents deletion. Archived profiles are rejected by server preparation and review paths.
- Managed-cluster references are read strictly and checked under the same lock as link creation. Unreadable metadata disables deletion; no cascade removes linked records or execution artifacts.
- Configuration, pipeline and credential contents are neither rewritten nor deleted by lifecycle actions. No shell, remote API or job execution is introduced.
- Audit records retain action, actor and profile identity; optional lifecycle events retain reason and name, including deletion tombstones. Event retention is bounded to 2,000.
- Existing single-process locking/storage assumptions remain. Multiple independent application processes are outside this guarantee. A rollback to older code cannot enforce archive semantics; operator review is required.

Validation: focused service/API tests, concurrent prepare/delete coverage and browser fixtures cover permission, retention, blockers, stale changes, confirmation and archive behavior. No production targets or recovery profiles are mutated by these checks.
