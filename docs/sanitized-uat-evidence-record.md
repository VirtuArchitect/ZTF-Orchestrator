# Sanitized UAT Evidence Record Pattern

Use this pattern for non-NKP ZTF workflows such as Prism Central configuration,
cluster configuration, Foundation Central imaging, NDB setup, Calm workload
setup, drift checks, and backup/restore drills.

## Evidence Rules

- Do not commit screenshots or exports that reveal customer, workplace, host,
  IP, DNS, username, email, token, credential, serial number, or ticket data.
- Store raw evidence only in the approved private evidence location for the
  environment.
- Commit only sanitized summaries, hashes, run IDs, and pass/fail outcomes.
- Prefer workflow IDs, config template names, and redacted task references over
  concrete infrastructure details.

## Record Template

```yaml
evidence_id: ztf-uat-YYYYMMDD-001
orchestrator_version: v1.5.2
workflow: config-pc
environment_class: uat
operator_role: operator
approval:
  required: true
  approval_id: redacted-or-internal-reference
inputs:
  config_template: pc-config.yml
  config_hash_sha256: "<sha256 of sanitized YAML or canonicalized input>"
execution:
  job_id: "<orchestrator job id>"
  started_at: YYYY-MM-DDTHH:MM:SSZ
  completed_at: YYYY-MM-DDTHH:MM:SSZ
  status: success
validation:
  health_check: pass
  drift_detection: matched
  external_task_reference: redacted
artifacts:
  raw_evidence_location: private-uat-evidence-store
  sanitized_summary_committed: true
notes: Sanitized; no workplace, customer, host, IP, credential, or ticket data.
```

## Recommended Repository Use

Create one Markdown entry per UAT validation in `docs/validation-status.md` and
link to the private evidence location by label only, not by sensitive URL. For
repeatable validations, keep the YAML record in the private evidence store and
commit only the sanitized summary and hash.
