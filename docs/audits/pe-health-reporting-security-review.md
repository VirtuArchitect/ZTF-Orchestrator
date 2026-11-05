# PE health-reporting security review

Scope: operational evidence presentation and collection outcome metadata, v1.8.5-rc1.

- Collection retains the same two fixed verified-HTTPS GETs, bounded responses, no redirects/proxies/TLS overrides and existing administrator/operator authorization. Viewing and display timers never collect PE.
- Failed collection records a fixed safe message and explicit failed outcome, without raw exception details, bodies, credentials or headers. Unverified, invalid, future or expired evidence never enters the fresh-Good count.
- Browser wall time is used only for a relative clock warning. Evidence expiry uses appliance timestamps plus monotonic elapsed display time. Dashboard fetch failures suppress a current health claim and remain distinct from PE collection failures.
- Existing data remains compatible. Outcome values are validated if present; diagnostics are derived on response and are not accepted as caller-provided health overrides or persisted to cluster identity records. No SQL migration or new dependency.
- Attention labels refine existing records without deleting notes/history or reopening an unchanged acknowledgement. Success never silently resolves incidents. Recovery approvals, health/acceptance gates and execution paths are unchanged.
- Validation uses generic fixtures and network-isolated smoke checks. No live cluster is contacted for this reporting change. A relative clock warning is not an absolute clock attestation; API health evidence remains distinct from NCC, application readiness and restore acceptance.
