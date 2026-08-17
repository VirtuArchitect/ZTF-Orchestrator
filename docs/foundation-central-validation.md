# Foundation Central Validation Path

Foundation Central cluster-create and imaging workflows must be validated
separately from Prism Central configuration. A successful `config-pc` UAT test
does not prove imaging, bare-metal preparation, or cluster creation readiness.

Current ZTF-Orchestrator release for this validation path: `v1.7.7`.

## Workflows

- `cluster-create`: integrated Prism Central Foundation Central cluster creation
  and imaging path through the bundled ZeroTouch Framework workflow.
- `cluster-create-standalone-fca`: standalone Foundation Central Appliance
  cluster creation intent with read-only Lifecycle v4.3 dry-run validation.
  Destructive Run Workflow is blocked until the cluster deployment/action API
  sequence is implemented and validated.
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
orchestrator_version: v1.7.7
workflow: cluster-create
environment_class: uat
foundation_central:
  endpoint: redacted
  version: redacted-or-not-recorded
  target: integrated_pc_fc-or-standalone_fca
inputs:
  config_template: create_cluster.yml-or-create_fca_cluster.yml
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

## Current v1.7.7 Status

Prism Central configuration and drift detection can be tracked separately in
`docs/validation-status.md`. Foundation Central cluster-create and imaging
remain their own validation lane until this checklist is completed in safe UAT.
Standalone FCA dry-run validation can confirm endpoint, credential, hardware
provider, node, and image visibility through Lifecycle v4.3 without invoking
destructive deployment actions.
