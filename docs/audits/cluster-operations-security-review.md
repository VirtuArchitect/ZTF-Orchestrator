# Managed-cluster operations security review

Scope: additive operational records, attention lifecycle, explicit read-only PE
health collection and console/recovery polling. No penetration testing or live
infrastructure mutation is part of this change.

- Authentication uses the existing bearer-session and role middleware. Cluster
  record creation/editing is administrator-only; PE reads and attention review
  permit administrator/operator; viewers receive recorded results only.
- No job submission, CLI execution, password change, approval override or recovery
  state transition is introduced. Deep links perform existing GETs only.
- PE origins use the existing HTTPS-only validator; credentials in URLs, paths,
  query strings and non-HTTPS schemes are rejected. Reads use two fixed GET paths,
  mandatory system CA/SAN validation, no redirects/proxies and existing time/size
  bounds. No user-provided TLS or target override is accepted by the health route.
- Baseline UUID/name and full physical membership are independently configured;
  missing or unsupported evidence cannot produce Good. Edited baselines invalidate
  observations. In-flight duplicate requests and changed baselines are rejected.
- New metadata uses the existing document store/backup path and in-process lock.
  Revision checks prevent stale administrative and attention-review writes. The
  general maintenance gate blocks writes; GET materialization skips persistence
  while maintenance is active. Unreadable state is not reset.
- New records contain credential references, endpoint/identity metadata and bounded
  operator notes. No resolved secrets, raw PE responses, headers or exception text
  are stored. Avoid secrets in labels/notes. Existing global read permissions are
  retained; grouping is not a per-cluster authorization boundary.
- Attention changes emit an audit action, actor and record ID. Explicit reviews
  retain up to 100 note/ownership transitions in the operational document. Later
  successful target reads do not silently resolve an incident.
- UI text is rendered through React, with no HTML injection. Reference filenames
  are checked against existing saved files and contain no paths. Linked pipeline
  and recovery IDs must already exist. Associations are navigation, not target
  verification. No script or file parser is invoked by saving a record.
- The optional Foundation YAML draft helper uses the existing YAML library and a
  128 KiB content bound. Only names, VIPs and expected node identities/addresses
  are extracted; credentials/password fields are not copied. Selection clears
  the UUID and requires review and an explicit save. It cannot execute automation.
- Read-only polling is non-overlapping, pauses hidden tabs and backs off on
  failures/429 responses. It never retries POST/PUT mutations or destructive jobs.

Residual boundaries: single-process locking, global existing RBAC, user-supplied
independent baseline accuracy and target API/version compatibility. Certificates
and reference permissions must be qualified in each environment. A full restore,
load test or physical recovery rehearsal is not established by isolated tests.
