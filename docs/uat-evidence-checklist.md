# UAT Evidence Checklist

Current release marker: `v1.7.7`.

Use this checklist to capture defensible evidence for controlled
ZTF-Orchestrator UAT. The goal is to prove what was tested, by whom, with which
version/configuration, and what the observed result was.

## Environment Evidence

- ZTF-Orchestrator version.
- Git commit, tag, image tag, or package version.
- Deployment mode: manual, Docker Compose, appliance, Kubernetes, or other.
- Storage backend: file or PostgreSQL.
- `ZTF_PATH`, `ZTF_REF`, `ZTF_PYTHON`, and optional `ZTF_NKP_PATH`.
- Application URL and target environment name.
- Backup status before high-risk work.
- Operator workstation or jump host where relevant.

## Identity and Governance Evidence

- Operator username.
- Operator role.
- Approver username and role.
- Approval ID.
- Approval timestamp.
- Change ticket or UAT record.
- Any exception approval or risk acceptance.

## Config/Profile Evidence

- Config filename.
- Config hash.
- YAML Studio export bundle where applicable.
- NKP profile ID, name, and revision where applicable.
- Generated YAML reference.
- Validation result and timestamp.

## Execution Evidence

- Workflow, script, pipeline, schedule, parallel run, or NKP phase.
- Job ID.
- Job start and end timestamps.
- Terminal job status.
- Execution log.
- Captured Nutanix task UUIDs where present.
- Cancellation or emergency stop record where applicable.

## Target-Side Evidence

- Prism Central, Prism Element, Foundation Central, registry, or NKP target
  confirmation.
- Screenshot, API output, exported report, or operator note.
- Explicit simulator/lab marker if target-side evidence is simulated.
- Any mismatch between expected and observed state.

## Recovery Evidence

- Failed job classification.
- Recovery decision.
- Rollback or remediation step.
- Follow-up job ID.
- Final target state.
- Escalation or support reference.

## Audit Evidence

- App audit events for login, approval, job submission, backup, restore, config
  update, and evidence export.
- Host/container/systemd/Kubernetes logs for service changes.
- Database backup or restore records.
- Offline package checksums for air-gapped updates.

## Acceptance Summary

Record one of these outcomes:

- Pass: scenario completed and evidence is complete.
- Pass with exception: scenario completed with documented accepted exception.
- Partial: scenario produced useful evidence but did not fully satisfy the
  objective.
- Fail: scenario failed and requires remediation before readiness claim.
- Not tested: scenario was intentionally deferred with reason and owner.
