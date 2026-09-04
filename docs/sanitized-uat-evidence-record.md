# Sanitized UAT Evidence Record Pattern

Use this pattern for non-NKP ZTF workflows such as Prism Central configuration,
cluster configuration, Foundation Central imaging, NDB setup, Calm workload
setup, drift checks, backup/restore drills, and native Foundation planning
reviews.

Current ZTF-Orchestrator release for new evidence records: `v1.8.1`.

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
orchestrator_version: v1.8.1
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

For native Foundation planning reviews, include these additional sanitized
fields:

```yaml
native_foundation:
  packet_id: native-foundation-review-...
  plan_id: native-foundation-...
  contract_version: native-foundation-adapter-contract/v1.8.1-readonly
  phase: hci_cluster_create
  approval_id: "<sanitized approval record id or alias>"
  validation_evidence_id: "<sanitized captured evidence record id or alias>"
  evidence_pack_ids:
    - native-foundation-evidence-...
  artifact_hashes:
    manifest_json: "<sha256>"
    plan_json: "<sha256>"
    provider_topology_matrix_json: "<sha256>"
    provider_operation_catalog_json: "<sha256>"
    provider_operation_admission_review_json: "<sha256>"
    provider_operation_queue_plan_json: "<sha256>"
    provider_operation_queue_admission_review_json: "<sha256>"
    live_discovery_contract_json: "<sha256>"
    discovery_reconciliation_json: "<sha256>"
    node_imaging_plan_json: "<sha256>"
    cluster_formation_plan_json: "<sha256>"
    post_create_validation_plan_json: "<sha256>"
    execution_graph_json: "<sha256>"
    execution_admission_review_json: "<sha256>"
    execution_adapter_contract_json: "<sha256>"
    execution_request_review_json: "<sha256>"
    dry_run_ledger_json: "<sha256>"
    execution_permit_review_json: "<sha256>"
    execution_lock_plan_json: "<sha256>"
    execution_audit_plan_json: "<sha256>"
    execution_retention_plan_json: "<sha256>"
    execution_runner_readiness_json: "<sha256>"
    controlled_uat_entry_review_json: "<sha256>"
    controlled_uat_operations_review_json: "<sha256>"
    controlled_uat_runbook_review_json: "<sha256>"
    controlled_uat_security_review_json: "<sha256>"
    controlled_uat_signoff_review_json: "<sha256>"
    controlled_uat_scope_review_json: "<sha256>"
    job_state_plan_json: "<sha256>"
    provider_preflight_json: "<sha256>"
    recovery_plan_json: "<sha256>"
    secret_references_json: "<sha256>"
    secret_resolution_plan_json: "<sha256>"
    secret_store_binding_review_json: "<sha256>"
    secret_store_provider_contract_review_json: "<sha256>"
    adapter_activation_review_json: "<sha256>"
    adapter_enablement_review_json: "<sha256>"
    adapter_allow_list_review_json: "<sha256>"
    adapter_load_plan_review_json: "<sha256>"
    adapter_package_provenance_review_json: "<sha256>"
    adapter_sbom_review_json: "<sha256>"
    adapter_runtime_isolation_review_json: "<sha256>"
    adapter_runtime_admission_review_json: "<sha256>"
    adapter_execution_preflight_review_json: "<sha256>"
    adapter_target_connectivity_review_json: "<sha256>"
    adapter_credential_handoff_review_json: "<sha256>"
    adapter_command_invocation_review_json: "<sha256>"
    adapter_output_evidence_review_json: "<sha256>"
  secret_reference_summary:
    missing_credential_ref_count: 0
    inline_secret_finding_count: 0
  provider_topology_matrix_summary:
    status: blocked
    matrix_row_count: 0
    missing_evidence_count: 0
    mutating_enabled_row_count: 0
  provider_operation_catalog_summary:
    status: blocked
    operation_catalog_row_count: 0
    operation_count: 0
    mutating_operation_count: 0
    runnable_operation_count: 0
  provider_operation_admission_review_summary:
    status: blocked
    operation_admission_record_count: 0
    admitted_operation_count: 0
    runnable_operation_count: 0
  provider_operation_queue_plan_summary:
    status: blocked
    operation_queue_item_count: 0
    queued_operation_count: 0
    persisted_operation_queue_count: 0
    runnable_operation_count: 0
  provider_operation_queue_admission_review_summary:
    status: blocked
    operation_queue_admission_record_count: 0
    admitted_operation_queue_count: 0
    queued_operation_count: 0
    persisted_operation_queue_count: 0
    runnable_operation_count: 0
  secret_resolution_plan_summary:
    resolution_plan_id: native-foundation-secret-resolution-...
    resolution_request_count: 0
    resolved_secret_count: 0
    blocked_secret_resolution_check_count: 0
  secret_store_binding_review_summary:
    binding_review_id: native-foundation-secret-binding-review-...
    binding_count: 0
    resolved_binding_count: 0
    secret_value_exposure_count: 0
    adapter_handoff_enabled_count: 0
    blocked_secret_binding_check_count: 0
  secret_store_provider_contract_review_summary:
    provider_contract_review_id: native-foundation-secret-provider-review-...
    provider_declared_count: 0
    supported_provider_count: 0
    credential_reference_count: 0
    secret_value_exposure_count: 0
    blocked_provider_contract_check_count: 0
    provider_approval_enabled: false
    lease_opening_enabled: false
    credential_handoff_enabled: false
  controlled_uat_entry_review_summary:
    uat_entry_review_id: native-foundation-uat-entry-...
    entry_item_count: 0
    blocked_entry_item_count: 0
    runner_blocker_count: 0
    rehearsal_case_count: 0
    blocked_uat_entry_check_count: 0
  controlled_uat_scope_review_summary:
    uat_scope_review_id: native-foundation-uat-scope-review-...
    scope_record_count: 0
    site_scope_count: 0
    provider_scope_count: 0
    deployment_scope_count: 0
    node_scope_count: 0
    blocked_scope_check_count: 0
  controlled_uat_runbook_review_summary:
    uat_runbook_review_id: native-foundation-uat-runbook-...
    runbook_step_count: 0
    blocked_runbook_step_count: 0
    planned_runbook_step_count: 0
    blocked_runbook_check_count: 0
    rollback_owner_declared: false
    uat_window_declared: false
    evidence_retention_target_declared: false
  controlled_uat_security_review_summary:
    uat_security_review_id: native-foundation-uat-security-...
    security_item_count: 0
    blocked_security_item_count: 0
    blocked_security_check_count: 0
    secret_value_exposure_count: 0
    security_reviewer_declared: false
    security_review_ref_declared: false
  controlled_uat_operations_review_summary:
    uat_operations_review_id: native-foundation-uat-operations-...
    operations_item_count: 0
    blocked_operations_item_count: 0
    blocked_operations_check_count: 0
    recovery_action_count: 0
    backup_target_count: 0
    lock_request_count: 0
    operations_owner_declared: false
    maintenance_ticket_declared: false
    backup_evidence_ref_declared: false
  controlled_uat_signoff_review_summary:
    uat_signoff_review_id: native-foundation-uat-signoff-...
    signoff_item_count: 0
    blocked_signoff_item_count: 0
    blocked_signoff_check_count: 0
    source_review_count: 0
    signoff_owner_declared: false
    signoff_ref_declared: false
  adapter_load_plan_review_summary:
    load_plan_review_id: native-foundation-adapter-load-plan-...
    load_plan_entry_count: 0
    loaded_adapter_count: 0
    instantiated_adapter_count: 0
    blocked_load_plan_check_count: 0
    load_plan_owner_declared: false
    load_plan_ref_declared: false
  adapter_package_provenance_review_summary:
    package_provenance_review_id: native-foundation-adapter-package-provenance-...
    package_provenance_entry_count: 0
    package_readable_count: 0
    package_hash_verified_count: 0
    signature_verified_count: 0
    package_staged_count: 0
    blocked_package_provenance_check_count: 0
    package_owner_declared: false
    package_ref_declared: false
    package_sha256_declared: false
    signature_ref_declared: false
    signer_ref_declared: false
  adapter_sbom_review_summary:
    sbom_review_id: native-foundation-adapter-sbom-review-...
    sbom_entry_count: 0
    sbom_readable_count: 0
    sbom_generated_count: 0
    sbom_hash_verified_count: 0
    component_inventory_read_count: 0
    vulnerability_scan_run_count: 0
    blocked_sbom_check_count: 0
    sbom_owner_declared: false
    sbom_ref_declared: false
    sbom_format_supported: false
    sbom_sha256_declared: false
    vulnerability_scan_ref_declared: false
  adapter_runtime_isolation_review_summary:
    runtime_isolation_review_id: native-foundation-adapter-runtime-isolation-...
    runtime_isolation_entry_count: 0
    sandbox_created_count: 0
    network_policy_applied_count: 0
    filesystem_policy_applied_count: 0
    adapter_process_started_count: 0
    runtime_hook_registered_count: 0
    blocked_runtime_isolation_check_count: 0
    runtime_owner_declared: false
    isolation_profile_supported: false
    sandbox_image_ref_declared: false
    network_policy_ref_declared: false
    filesystem_policy_ref_declared: false
  adapter_runtime_admission_review_summary:
    runtime_admission_review_id: native-foundation-adapter-runtime-admission-review-...
    runtime_admission_entry_count: 0
    runtime_admitted_count: 0
    adapter_load_approved_count: 0
    adapter_process_start_approved_count: 0
    secret_handoff_approved_count: 0
    mutating_job_submission_approved_count: 0
    blocked_runtime_admission_check_count: 0
    admission_owner_declared: false
    runtime_admission_ref_declared: false
    change_ticket_ref_declared: false
    exception_ref_reviewed: false
  adapter_execution_preflight_review_summary:
    execution_preflight_review_id: native-foundation-adapter-execution-preflight-review-...
    execution_preflight_entry_count: 0
    adapter_preflight_run_count: 0
    secrets_resolved_count: 0
    target_connections_opened_count: 0
    foundation_reachability_checked_count: 0
    hardware_reachability_checked_count: 0
    rollback_readiness_verified_count: 0
    blocked_execution_preflight_check_count: 0
    preflight_owner_declared: false
    preflight_ref_declared: false
    adapter_command_ref_declared: false
    target_connectivity_ref_declared: false
    rollback_readiness_ref_declared: false
  adapter_target_connectivity_review_summary:
    target_connectivity_review_id: native-foundation-adapter-target-connectivity-review-...
    target_connectivity_entry_count: 0
    target_connections_opened_count: 0
    foundation_reachability_probed_count: 0
    prism_element_reachability_probed_count: 0
    bmc_reachability_probed_count: 0
    hardware_provider_reachability_probed_count: 0
    secrets_resolved_count: 0
    blocked_target_connectivity_check_count: 0
    target_connectivity_owner_declared: false
    target_connectivity_scope_declared: false
    target_allowlist_reference_declared: false
    maintenance_window_reference_declared: false
    probe_plan_reference_declared: false
  adapter_credential_handoff_review_summary:
    credential_handoff_review_id: native-foundation-adapter-credential-handoff-review-...
    credential_handoff_entry_count: 0
    credential_binding_count: 0
    credential_reference_count: 0
    secret_lease_opened_count: 0
    secret_values_resolved_count: 0
    secret_values_exposed_count: 0
    credentials_handed_to_adapter_count: 0
    adapter_identity_verified_count: 0
    redaction_policy_applied_count: 0
    blocked_credential_handoff_check_count: 0
    credential_handoff_owner_declared: false
    credential_handoff_ref_declared: false
    secret_lease_policy_ref_declared: false
    adapter_identity_ref_declared: false
    redaction_policy_ref_declared: false
  adapter_command_invocation_review_summary:
    command_invocation_review_id: native-foundation-adapter-command-invocation-review-...
    command_invocation_entry_count: 0
    command_assembled_count: 0
    command_file_written_count: 0
    adapter_invoked_count: 0
    adapter_process_started_count: 0
    target_connections_opened_count: 0
    secrets_resolved_count: 0
    command_output_captured_count: 0
    blocked_command_invocation_check_count: 0
    adapter_command_owner_declared: false
    adapter_command_catalog_ref_declared: false
    adapter_invocation_policy_ref_declared: false
    adapter_execution_identity_ref_declared: false
    adapter_output_capture_ref_declared: false
  adapter_output_evidence_review_summary:
    output_evidence_review_id: native-foundation-adapter-output-evidence-review-...
    output_evidence_entry_count: 0
    command_output_captured_count: 0
    stdout_captured_count: 0
    stderr_captured_count: 0
    artifacts_written_count: 0
    artifacts_redacted_count: 0
    evidence_persisted_count: 0
    live_failures_classified_count: 0
    blocked_output_evidence_check_count: 0
    adapter_output_evidence_owner_declared: false
    adapter_output_retention_ref_declared: false
    adapter_artifact_redaction_ref_declared: false
    adapter_failure_classification_ref_declared: false
    adapter_evidence_store_ref_declared: false
  discovery_reconciliation_summary:
    matched_node_count: 0
    missing_discovery_node_count: 0
    unexpected_discovery_node_count: 0
  node_imaging_plan_summary:
    node_plan_count: 0
    ready_for_review_node_count: 0
    missing_payload_field_count: 0
  cluster_formation_plan_summary:
    cluster_plan_count: 0
    ready_for_review_cluster_count: 0
    missing_formation_field_count: 0
  post_create_validation_plan_summary:
    validation_plan_count: 0
    ready_for_review_validation_count: 0
    missing_validation_input_count: 0
  execution_admission_review_summary:
    selected_cluster_count: 0
    admission_decision_count: 0
    blocked_admission_check_count: 0
  execution_adapter_contract_summary:
    adapter_request_count: 0
    blocked_adapter_contract_check_count: 0
    resolved_secret_count: 0
  execution_request_review_summary:
    execution_request_count: 0
    submitted_execution_count: 0
    blocked_execution_request_check_count: 0
  dry_run_ledger_summary:
    ledger_id: native-foundation-dry-run-ledger-...
    ledger_entry_count: 0
    mutating_operation_planned_count: 0
    executed_step_count: 0
    blocked_dry_run_check_count: 0
  execution_permit_review_summary:
    permit_id: native-foundation-execution-permit-...
    permit_count: 0
    issued_permit_count: 0
    adapter_request_count: 0
    registry_entry_count: 0
    blocked_permit_check_count: 0
  execution_lock_plan_summary:
    lock_plan_id: native-foundation-lock-plan-...
    lock_request_count: 0
    acquired_lock_count: 0
    site_lock_count: 0
    cluster_lock_count: 0
    adapter_lock_count: 0
    blocked_lock_check_count: 0
  execution_audit_plan_summary:
    audit_plan_id: native-foundation-audit-plan-...
    audit_event_count: 0
    persisted_audit_event_count: 0
    retention_artifact_count: 0
    persisted_retention_artifact_count: 0
    blocked_audit_check_count: 0
  execution_retention_plan_summary:
    retention_plan_id: native-foundation-retention-plan-...
    retention_policy_count: 0
    persisted_retention_policy_count: 0
    backup_target_count: 0
    backup_created_count: 0
    restore_rehearsal_check_count: 0
    restore_tested_count: 0
    blocked_retention_check_count: 0
  execution_runner_readiness_summary:
    runner_readiness_id: native-foundation-runner-readiness-...
    readiness_item_count: 0
    blocked_readiness_item_count: 0
    runner_start_enabled_count: 0
    blocked_runner_check_count: 0
  native_foundation_review_job:
    job_id: "<durable-review-job-id>"
    status: success
    mutation_enabled: false
  recovery_plan_summary:
    recovery_action_count: 0
    blocked_recovery_check_count: 0
  job_state_plan_summary:
    state_transition_count: 0
    persisted_state_transition_count: 0
    blocked_job_state_check_count: 0
  adapter_uat_rehearsal_summary:
    rehearsal_case_count: 0
    provider_operation_case_count: 0
    deployment_case_count: 0
    required_evidence_count: 0
    blocked_uat_check_count: 0
  adapter_activation_review_summary:
    request_id: "<native-foundation-adapter-activation-id>"
    required_evidence_count: 0
    accepted_evidence_count: 0
    blocked_activation_check_count: 0
  adapter_enablement_review_summary:
    registry_entry_count: 0
    disabled_registry_entry_count: 0
    blocked_enablement_check_count: 0
    registry_entry_ids:
      - native-foundation-adapter-registry-...
  adapter_allow_list_review_summary:
    allow_list_review_id: native-foundation-adapter-allow-list-review-...
    allow_list_entry_count: 0
    allowed_entry_count: 0
    blocked_allow_list_check_count: 0
    allow_list_persistence_enabled: false
    adapter_loading_enabled: false
  mutation_enabled: false
  execution_permit_issued: false
  execution_locks_acquired: false
  audit_persistence_enabled: false
  retained_evidence_export_enabled: false
  native_foundation_backup_restore_enabled: false
  native_foundation_runner_start_enabled: false
  adapter_activation_enabled: false
  adapter_allow_list_persistence_enabled: false
  adapter_registry_mutation_enabled: false
  adapter_uat_execution_enabled: false
  controlled_uat_entry_enabled: false
  controlled_uat_scope_authorized: false
  controlled_uat_runbook_approved: false
  controlled_uat_security_approved: false
  controlled_uat_operations_approved: false
  job_state_persistence_enabled: false
  secret_resolution_enabled: false
```

## Recommended Repository Use

Create one Markdown entry per UAT validation in `docs/validation-status.md` and
link to the private evidence location by label only, not by sensitive URL. For
repeatable validations, keep the YAML record in the private evidence store and
commit only the sanitized summary and hash.
