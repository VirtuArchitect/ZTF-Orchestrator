# ZTF 2.x Plan/Apply Roadmap

ZTF 2.x support is tracked separately from the v1.5.x ZTF 1.x orchestrator
hardening line. The goal is to avoid blending new framework semantics with the
current production UAT validation path.

## Principles

- Keep v1.5.x focused on ZTF 1.x workflows, UAT hardening, approvals, backup,
  evidence, and operational readiness.
- Treat ZTF 2.x as a separate adapter with explicit plan/apply semantics.
- Never run an apply action without a persisted plan, approval, and evidence
  trail.

## Proposed Phases

1. Discovery
   - Inventory ZTF 2.x commands, inputs, outputs, and state model.
   - Identify differences from ZTF 1.x workflow IDs and YAML structure.
2. Plan mode
   - Add read-only plan generation.
   - Persist plan output and input hash.
   - Render plan summary in the UI.
3. Approval gate
   - Require approval for the exact plan ID and input hash.
   - Block apply if the plan expires or inputs change.
4. Apply mode
   - Execute only approved plans.
   - Stream task output into the job model.
   - Attach sanitized evidence records.
5. Migration guidance
   - Document which ZTF 1.x workflows map to ZTF 2.x.
   - Keep unsupported workflows explicit.

## Non-Goals for v1.5.2

- No ZTF 2.x apply execution.
- No automatic migration of ZTF 1.x configs to ZTF 2.x.
- No shared approval bypass between 1.x direct workflows and 2.x plan/apply.
