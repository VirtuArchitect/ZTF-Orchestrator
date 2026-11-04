# PC unregistration implementation and security review

## Scope

Source implementation of the administrator Unregister PE from PC wizard, its
reference-only YAML, approval gate and native v4.2 adapter. Validation uses
simulated PC responses and isolated test data. No live PC/PE operation or
compatibility certification is part of this review.

## Reviewed controls

- Authorization: review, approval creation and execution require an administrator.
  Existing approval decisions remain administrator-only; this action additionally
  rejects self-approval. Operators/viewers cannot reach the privileged routes.
- Approval: exact nonempty YAML and filename, decision, expiry, separate reviewer
  and job binding are checked. One request cannot authorize another job. The
  worker checks the gate at start and again immediately before the write after
  vendor preflight. Queue submission and approval linking are serialized with
  worker validation in the supported single-process application model.
- Input: bounded YAML, strict known keys, credential-reference-only intent,
  canonical non-nil UUIDs and a bounded HTTPS PC endpoint on port 9440. URL
  credentials, paths, queries, unsafe literal local targets and script composition
  are rejected. The authenticated administrative endpoint is the intended network
  trust boundary; no arbitrary server-returned URL is followed.
- Transport: certificate and hostname verification remain enabled. Redirects and
  environment proxy inheritance are disabled. Response sizes and task polling
  are bounded. Credentials travel in HTTPS authorization headers, never shell
  arguments, intent, job metadata or raw error output.
- Mutation: PC and PE identities are read before vendor preflight and rechecked
  before mutation. The API dry-run task must succeed. The real operation is
  submitted once with a request UUID. Errors, cancellation, transport uncertainty
  and unknown responses do not trigger mutation retries or fallback commands.
- Verification: successful task completion and a new PE-inventory absence read
  from the same PC are required. An initial missing target is not accepted as
  successful removal. Diagnostics preserve the narrower PC-side scope and the
  separate PE-side cleanup/dependent-service follow-up.
- Automation boundaries: ordinary script composition, schedules, parallel runs
  and pipelines cannot bypass the mandatory direct-job approval. The standalone
  script alias is routed through the dedicated service, never the legacy runner.
- Dependencies/storage: standard-library adapter; no new runtime dependency,
  migration or credential storage format. Existing durable jobs, history and
  approval records are reused. Source feature documentation is separate from
  existing release assets and installed appliance state.

## Validation and remaining boundary

Focused tests cover invalid endpoints/UUIDs/intent, strict TLS/no redirects,
credential error redaction, role denial, exact-content and single-use approval,
independent decisions, expiry/rejection, approval changes during preflight,
cancelled/failed vendor tasks, uncertain writes and unsuccessful final readback.
Mocked API job smoke verifies the native dispatch and local no-target dry-run.
Browser smoke exercises generation, lookup, acknowledgement, approval request,
UUID confirmation, single submission, job navigation and mobile layout.

Target API availability, vendor task/preflight behavior, service dependencies,
PC/PE compatibility and final cleanup still require controlled validation against
the intended environment before operational use. The action does not claim to
prove PE-side cleanup, service health or safe registration to a different PC.

+
+## Local verification receipt
+
+- Full Python collection: 1,244 tests, run in four isolated pytest processes:
+  1,240 passed and four skipped. The final focused unregistration run passed all
+  43 tests, including the mandatory default approval setting.
+- Adjacent backend/release checks: 105 passed. Browser checks: 12 distinct tests
+  passed across the new wizard, existing script-schema contracts and PE title
+  workflow. The new wizard smoke was repeated last to retain desktop/mobile
+  review captures, with all PC/API responses simulated.
+- `npm run build`, `npm run build:demo`, Python compilation and
+  `git diff --check` passed. Build output retains existing bundle-size and unset
+  demo-variable warnings. `npm audit --omit=dev --audit-level=high` reported zero
+  production vulnerabilities. The unchanged development dependency tree still
+  reports one moderate and two high audit findings; no dependency changes were
+  introduced for this action.
+- Skips: Windows symlink capability, an OpenSSL-dependent HTTPS fixture, and two
+  disposable-PostgreSQL checks (no test database configured). Strict TLS context
+  and redirect denial are independently covered by the focused adapter tests.
+- No live target execution, installed-appliance validation, image build, public
+  release, commit or push was performed. Existing checkout changes were preserved
+  by using a separate feature worktree.
+