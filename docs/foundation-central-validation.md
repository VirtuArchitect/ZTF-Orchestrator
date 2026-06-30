# Foundation Central Validation Path

Foundation Central cluster-create and imaging workflows must be validated
separately from Prism Central configuration. A successful `config-pc` UAT test
does not prove imaging, bare-metal preparation, or cluster creation readiness.

## Workflows

- `cluster-create`: full Foundation Central cluster creation and imaging path.
- `imaging-only`: image nodes without creating the cluster.
- `imaging`: pod imaging path used by broader site or pod deployment flows.

## Validation Gates

1. Connection profile has a Foundation Central endpoint and credential reference.
2. AOS and hypervisor image references are populated and reachable from the UAT
   Foundation Central environment.
3. Node discovery/precheck is confirmed outside production.
4. Dry run succeeds for the selected workflow.
5. A mandatory approval request is approved for the exact workflow and YAML.
6. Execution job completes successfully in UAT.
7. Post-run validation confirms expected imaging or cluster-create state.
8. A sanitized UAT evidence record is created.

## Sanitized Result Template

```yaml
validation_id: fc-uat-YYYYMMDD-001
orchestrator_version: v1.5.2
workflow: cluster-create
environment_class: uat
foundation_central:
  endpoint: redacted
  version: redacted-or-not-recorded
inputs:
  config_template: create_cluster.yml
  image_references_verified: true
  config_hash_sha256: "<sha256 of sanitized YAML or canonicalized input>"
approval:
  required: true
  status: approved
execution:
  job_id: "<orchestrator job id>"
  status: success
validation:
  dry_run: pass
  imaging_path: pass
  cluster_create_path: pass
  drift_or_post_check: pass
notes: Sanitized; no workplace, customer, host, IP, credential, or ticket data.
```

## Current v1.5.2 Status

Prism Central configuration and drift detection can be tracked separately in
`docs/validation-status.md`. Foundation Central cluster-create and imaging
remain their own validation lane until this checklist is completed in safe UAT.
