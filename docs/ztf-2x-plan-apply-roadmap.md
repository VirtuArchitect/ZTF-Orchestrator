# ZTF 2.x Plan/Apply Roadmap

ZTF 2.x support is tracked separately from the legacy ZTF 1.x orchestrator
lane. The goal is to avoid blending new framework semantics with the current
production UAT validation path.

Current ZTF-Orchestrator release for this roadmap baseline: `v1.8.0`.

## Principles

- Keep the legacy lane focused on ZTF 1.x workflows, scripts, UAT hardening,
  approvals, backup, evidence, and operational readiness.
- Treat ZTF 2.x as a separate adapter with explicit plan/apply semantics.
- Never run an apply action without a persisted plan, approval, and evidence
  trail.

## Implementation Phases

1. Discovery - in progress
   - Inventory ZTF 2.x commands, inputs, outputs, and state model.
   - Identify differences from ZTF 1.x workflow IDs and YAML structure.
2. Runtime availability - implemented foundation
   - Admin Settings exposes separate ZTF 1.x and ZTF 2.x runtime availability.
   - ZTF 1.x remains pinned to the legacy workflow/script path.
   - ZTF 2.x has its own runtime path, command, and project directory.
3. Plan mode - implemented foundation
   - Add ZTF 2.x job submission through the durable job queue.
   - Persist plan output path and input/global/state hashes in the job trace.
   - Render plan submission through ZTF 2.x workflow templates, the ZTF 2.x
     IaC page, and demo fixtures.
4. Approval gate - implemented foundation
   - Require approval for the exact plan ID, input hash, global hash, and state path.
   - Block apply or destroy when the source plan job is missing, failed, expired, or mismatched.
5. Apply mode - guarded foundation
   - Execute only approved apply or destroy submissions.
   - Stream CLI output into the job model.
   - Keep broader live UAT and resource-specific mappings as follow-up validation work.
6. Workflow integration - implemented foundation
   - Add ZTF 2.x workflow templates for Prism Central category, Project,
     subnet/VLAN intent, image registration, VM deployment, security groups,
     protection policy, and recovery plan.
   - Generate `input.yml`, editable `global.yml`, and state file names from
     workflow forms.
   - Submit workflow runs as `ztf2:plan` jobs with the source workflow template
     retained in job trace metadata.
7. Converted script actions - implemented foundation
   - Add a separate Scripts 2.x page for converted declarative script patterns.
   - Generate `input.yml`, editable `global.yml`, and state file names from
     category, project, subnet, image, VM, security group, protection policy,
     and recovery plan action forms.
   - Submit converted actions as `ztf2:plan` jobs with legacy script mapping
     metadata visible to operators.
   - Keep imperative PE, CVM/Foundation, delete, and power actions explicit as
     Scripts 1.x until verified ZTF 2.x resource contracts exist.
8. Migration guidance - planned
   - Expand documented ZTF 1.x to ZTF 2.x workflow mappings after command and
     resource coverage is verified.
   - Keep unsupported workflows explicit.

## Non-Goals For Legacy Mode

- No automatic migration of ZTF 1.x configs to ZTF 2.x.
- No shared approval bypass between 1.x direct workflows and 2.x plan/apply.
- No login-screen runtime selector; runtime availability is admin-managed and
  job mode is selected in Workflows, Scripts, or ZTF 2.x IaC pages.
