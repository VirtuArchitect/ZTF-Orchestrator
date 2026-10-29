# Disaster Recovery implementation review

Scope: additive recovery UI/API, JSON document persistence and orchestration of
existing Foundation VM and PE configuration jobs. Release marker remains
v1.8.5-rc1; stable release promotion is outside this change.

## Security controls reviewed

- Existing authenticated roles protect every endpoint. Mutations require admin;
  viewer/operator access is read-only. Existing rate limits and job maintenance
  locks remain in effect. Each job submission revalidates its administrator session.
- Baselines use safe bounded YAML parsing and credential references. Literal
  password/secret/token/private-key keys, inline private keys and URL userinfo
  credentials are rejected. Source files use existing
  confined YAML paths. Snapshot and event output uses React text escaping.
- Snapshots bind exact deployment content, endpoint, physical node identities,
  pipeline step order and per-step YAML hashes. Changed source intent blocks
  deployment; optional observations remain separate, labelled operator imports.
- Re-foundation requires exact confirmations and an unused, unexpired approval
  for the exact YAML and run filename. The existing independent approver rule is
  retained. Approval consumption also applies when general policy is disabled.
  Recovery-bound approvals cannot be submitted through an ordinary job request.
- Shared job-queue locking prevents duplicate submission and conflicting
  Foundation endpoint/node ownership within one application process. Job IDs
  remain distinct for submissions in the same millisecond. This is not a
  distributed locking protocol and does not control external Foundation clients.
- Pipeline policy is checked before execution and before each subsequent step.
  Mandatory-approval actions require the existing direct-job path. Linked jobs
  must match action, exact YAML, successful execution and health-check timing;
  one job cannot satisfy multiple steps.
- Health evidence and final acceptance are explicit operator attestations.
  Configuration requires a health check recorded within 15 minutes. Acceptance
  additionally requires retained successful deployment/configuration jobs.
- Tokens remain in coordinator memory, never stored in recovery records. Errors
  from delegated execution are returned generically without copying API bodies,
  raw transport exceptions, YAML or secret material into recovery events.
- Restart/interruption requires reconciliation; no imaging or configuration is
  replayed automatically. Stop does not claim a confirmed Foundation abort.
  Uncertain password changes cannot be automatically resumed. Corrupt recovery
  storage fails closed, preserving ownership rather than resetting records.
- Static-demo recovery writes are explicitly rejected, without live API fallback.
  No runtime dependency, shell transport, credential mechanism or SQL migration
  was added.

## Verification and limits

The broader Python regression run passed 928 tests with two skips. After final
hardening, focused recovery/release-integrity checks cover exact approvals,
policy-disabled approval consumption, role restrictions, malformed inputs,
secret/cyclic YAML rejection, baseline drift, duplicates, Foundation ownership,
sequential execution, failure stops, stale health, direct-job linkage, retained
evidence, corruption and restart reconciliation. Hardware/API execution is mocked
in these tests.

Thirteen browser tests cover recovery and Start Here, including datacenter
creation, profile review, rehearsal preparation without deployment, confirmations,
viewer restrictions, asynchronous polling/close behavior and responsive themes.
A separate smoke used the built UI with an isolated authenticated API to save and
reload a datacenter, capture/review a profile and request exact-content approval;
it verified zero deployment jobs and no browser errors. Production and static-demo
builds passed; the build still reports its application chunk-size advisory.

Remaining validation: PostgreSQL-backed recovery persistence and representative
physical Foundation rebuild/configuration/restart/reconciliation exercises.
Local Docker activation was subsequently verified on 28 October 2026: healthy
runtime, matching packaged source hashes, unchanged persisted document/config
hashes, authenticated administrator navigation, datacenter form access and exact
installed-build reporting. These read-only checks did not create recovery records
in PostgreSQL or initiate a hardware deployment.
Independent health evidence is supplied by the operator, not collected by this
coordinator. VM/application restore, forensic remediation, cross-process locking
and production activation are outside this implementation validation.
