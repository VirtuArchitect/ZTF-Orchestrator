# ZTF-Orchestrator Console Production Functionality Audit

Audit date: 2026-06-29
Target: http://127.0.0.1:15001/
Mode: authenticated admin console review from screenshots and DOM snapshots

## Audit Scope

This audit reviewed whether the running console presents the core primitives a
production operator would expect: system readiness, durable execution, workflow
launching, governance, evidence capture, storage/backup posture, appliance
operations, user management, and auditability.

Screenshots were captured into this folder. The first full-page captures exposed
a browser capture issue on some routes, so accepted evidence uses the
`*-view.png` viewport screenshots plus DOM snapshots captured during the same
run.

## Captured Steps

| Step | Screenshot | Health |
|---|---|---|
| 1. Login wall | `01-start.png` | Healthy. Clear sign-in path and first-run credential hint. |
| 2. Dashboard | `02-dashboard-view.png` | Strong production cockpit, but mixed readiness signals need refinement. |
| 3. Jobs / Queue | `03-jobs-queue-view.png` | Strong durable-job surface; destructive delete action is too prominent. |
| 4. Approvals | `04-approvals-view.png` | Useful governance primitive; needs stronger aging/expiry/action clarity. |
| 5. Workflows catalogue | `05-workflows-view.png` | Good task entry and filtering for known operators. |
| 6. NKP overview | `06-nkp-framework-view.png` | Strong safe-phase framing; readiness/action boundaries should be sharper. |
| 7. Validation evidence | `07-validation-evidence-view.png` | Correct production concept; empty state depends on NKP profiles and should guide next step. |
| 8. Settings runtime | `08-settings-view.png` | Production-relevant runtime paths are visible to admins. |
| 9. Audit log | `09-audit-log-view.png` | Useful, but noisy HTTP asset events dilute operator signal. |
| 10. Setup & Install | `10-setup-install.png` | Good guided setup; manual commands remain available. |
| 11. Config files | `11-config-files.png` | Useful config inventory and upload/create entry points. |
| 12. Workflow detail | `12-workflow-detail-view.png` | Strong form-driven workflow launcher with disabled run states. |
| 13. Appliance ops | `13-appliance-ops-view.png` | Good appliance lifecycle coverage and artifact tracking. |
| 14. Users & roles | `14-users-view.png` | Basic RBAC management present; production identity controls are limited. |
| 15. Settings storage | `16-settings-storage-view.png` | Strong PostgreSQL/backup visibility; restore needs careful guardrails. |

## Strengths

- The dashboard gives operators a real operational cockpit: framework readiness,
  queue pressure, governance, validation evidence, schedules, storage, system
  status, common workflows, and recent executions are all visible on one screen.
- The application has the right production primitives: RBAC, approvals, audit
  log, durable jobs, persisted progress, PostgreSQL state, backups, appliance
  tracking, config management, and validation evidence.
- The Jobs / Queue page makes execution state concrete. Active, queued,
  running, failed, successful, cancelled, and interrupted filters match the
  mental model of a production job runner.
- Workflow detail pages disable destructive execution until enough required
  information is present. That is a good safety default.
- NKP is framed as safe-phase orchestration, and the copy explicitly states
  that apply, upgrade, registry push, and destroy actions are intentionally
  blocked in this release.
- Settings > Storage exposes the active backend, database location, retention,
  installed version, backup inventory, and admin backup actions in one place.
- Appliance Operations is not just an install note; it provides artifact,
  update, first-boot, NKP readiness, and ZTF mode surfaces.

## UX Risks

1. Dashboard readiness can over-reassure.
   - Evidence: `02-dashboard-view.png`
   - The top banner says "Framework ready for orchestration" while the same
     screen shows NKP profiles `0`, binaries `0/1`, validation evidence
     `missing`, and no generated configs. For production, readiness should be
     split into "runtime ready" versus "deployment ready" or "evidence ready."

2. The collapsed sidebar is efficient but opaque.
   - Evidence: all authenticated screenshots.
   - Production operators get icon-only navigation with no visible text. This
     saves space but makes less frequent tasks hard to discover, especially
     Approvals, Drift, Evidence, Appliance Ops, and Settings. Tooltips may exist,
     but screenshots cannot prove them.

3. Destructive actions are too visually close to routine review.
   - Evidence: `03-jobs-queue-view.png`, `16-settings-storage-view.png`,
     `14-users-view.png`.
   - Delete job, restore backup, delete user, and password reset controls are
     visible in dense operational pages. Restore is especially high impact.
     Production UX should add stronger confirmation context, disabled states
     when prerequisites are not satisfied, and a clearer separation between
     review actions and destructive actions.

4. The audit log is too noisy for incident review.
   - Evidence: `09-audit-log-view.png`.
   - The visible entries are dominated by static asset and favicon requests.
     That proves logging works, but it hides the operational events an admin
     needs first: login, auth failure, role change, config change, approval
     decision, job submitted, job cancelled, backup created, restore attempted.

5. Empty states do not always close the loop.
   - Evidence: `07-validation-evidence-view.png`, `02-dashboard-view.png`.
   - Validation Evidence correctly says no evidence exists, but the next best
     action is indirect: create or select an NKP profile first. Production
     operators need empty states that route them to the prerequisite screen.

6. Production identity posture is basic.
   - Evidence: `14-users-view.png`.
   - Admin/operator/viewer role management is present, but the screen does not
     expose MFA, SSO/OIDC/SAML, password age, last login, disabled users,
     service accounts, or active sessions. This may be acceptable for a small
     internal tool, but it is a production-readiness boundary.

7. Workflow forms show plausible sample values.
   - Evidence: `12-workflow-detail-view.png`.
   - Fields such as `10.0.0.100`, `my-cluster-01`, and `8.8.8.8` help users
     understand format, but in production they can blur the difference between
     placeholder and real input. Keep placeholders visually distinct and avoid
     sample values that could be accidentally submitted.

## Accessibility Risks

- Several icon-only controls have unclear visible names in screenshots: sidebar
  navigation icons, user-management key/trash buttons, row expand chevrons, and
  some small action buttons. DOM snapshots show some accessible names on major
  buttons, but not all icon actions were proven.
- Dark-mode contrast appears mostly strong for headings and primary content, but
  muted helper text, timestamps, and secondary labels may be low contrast in
  several cards.
- The dense icon sidebar likely requires tooltip, keyboard-focus, and screen
  reader verification. Screenshots cannot confirm focus order or tooltip
  availability.
- Destructive controls need robust keyboard confirmation and announcement
  behavior. Screenshots cannot confirm modal focus trap, Escape handling, or
  screen reader status messaging.
- Tabbed areas such as NKP and Settings visually communicate state, and DOM
  snapshots show tab roles for NKP. Keyboard traversal and arrow-key behavior
  still need manual or automated accessibility testing.

## Production Recommendations

1. Split readiness into explicit layers:
   - Runtime ready
   - ZTF workflow ready
   - NKP planning ready
   - Deployment evidence ready
   - Backup/recovery ready

2. Add an "Operator checklist" panel to the dashboard:
   - Configure runtime paths
   - Confirm storage backend
   - Create latest database backup
   - Create/validate config
   - Request approval where required
   - Run dry run
   - Submit job
   - Export evidence

3. Reduce audit-log noise by default:
   - Default to operational events rather than all HTTP requests.
   - Add filters for auth, user, job, approval, config, backup, restore,
     webhook, and system health.
   - Keep raw HTTP logs available as an advanced/debug view.

4. Strengthen destructive-action UX:
   - Move restore/delete actions behind overflow menus or detail panels.
   - Require typed confirmation for backup restore and user deletion.
   - Show blast radius before restore: users, sessions, jobs, approvals,
     evidence, settings, and audit data may roll back.

5. Improve production identity visibility:
   - Last login.
   - Disabled/locked state.
   - Active sessions.
   - Password reset history.
   - MFA/SSO status or an explicit "not supported" boundary.

6. Make empty states operational:
   - Validation Evidence should link to "Create NKP profile."
   - Dashboard `Binaries 0/1` should link directly to NKP Binaries.
   - Missing evidence should explain what evidence is required before UAT or
     production handover.

7. Add labels or persistent expanded mode for the sidebar:
   - Keep the compact icon rail for expert users.
   - Provide an expanded labeled mode for onboarding, occasional operators, and
     accessibility.

## Evidence Limits

- This was a screenshot and DOM-based audit, not a full functional test.
- I did not submit workflows, create users, restore backups, delete records, or
  run destructive actions.
- I did not test keyboard-only navigation, screen readers, zoom/reflow, or color
  contrast with automated tooling.
- I did not validate infrastructure behavior against real Nutanix targets.
- Several full-page screenshot captures were rejected because they showed blank
  content despite valid DOM snapshots. Accepted evidence uses viewport captures.

## Bottom Line

The console has credible production functionality for a small internal
operations platform. The strongest areas are durable execution, governance,
backup visibility, appliance operations, and safe NKP framing. The main work
before a stronger production claim is not adding more features; it is tightening
operator safety, reducing noisy signals, clarifying readiness levels, and making
identity/accessibility posture explicit.
