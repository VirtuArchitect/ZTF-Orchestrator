# Using the quick guides

Reviewed 20 November 2026 against application source `79c3ecc`. These procedures describe source behaviour; compare your installed build before use. v1.8.5-rc1 remains a prerelease; documentation does not update an appliance or certify target compatibility.

The library follows the ZTF operator documentation structure: purpose, prerequisites, required inputs, numbered procedure, validation, failure/recovery and evidence. The Word/PDF edition uses the maintained manual's portrait geometry, Arial typography and navy table headers. Each catalogue entry also has an individually linked Markdown guide.

## Before you begin

1. Confirm the exact installed build and service health in the dashboard. Use only infrastructure you are authorized to change.
2. Prepare the target's identity, maintenance window, current-state record and recovery plan. Use a role permitted by the installed policy; use an administrator for the dedicated administrator-only actions.
3. For legacy workflows/scripts, verify the ZTF 1.x runtime in Setup & Install and the selected Global Config vault. Saving a credential is not proof that the target accepts it. A reference must resolve in the selected vault with the right username and target rights.
4. Establish certificate trust for HTTPS and independently verify SSH host keys where required. Follow only a workflow's explicitly supported exception procedure; it does not relax other connections.

## Run one script

1. Open Advanced Automation → Scripts (Scripts 1.x), search the exact name and select only that script initially. The ID printed in its guide disambiguates similar PE and PC names.
2. Complete the script configuration wizard. Required means required by the form; operation-specific dependencies can require additional optional fields. Review available choices instead of accepting every default.
3. Select Generate YAML and inspect the full result. Generate YAML replaces the editor content for the selected script; generating each script in a queue does not automatically merge their configuration. Save reviewed files in Config Files for a deliberate pipeline.
4. Select Dry Run where available. Generic legacy Dry Run checks configuration, runtime and credential references; it does not establish target readiness or simulate rollback. Dedicated workflows document their read-only target checks separately. Read-only authentication can still trigger lockout limits.
5. Obtain required approvals. Run only the approved scope and enter any displayed exact destructive confirmation. A typed confirmation is not an independent approval.
6. Monitor the stream and Jobs / Queue. Require terminal job results plus task/readback evidence; process exit code zero, a progress bar or a successful handoff alone is insufficient. FAIL or CAN'T VERIFY must be investigated.

## Run one workflow

Open Workflows 1.x or the entry point specified by its guide. Complete Configure or import a reviewed matching file, then inspect YAML Preview. Use Download Config/Config Files as available. A generic YAML starter is an illustration, not a finished environment configuration. Validate, request the approvals required by the installed policy, run once, then inspect the underlying service and target state. If a pipeline rejects a mandatory approval workflow, use its supported direct approved path; do not disable approval to queue it.

## Stop and recover

Stop on identity mismatch, failed validation, missing approval, expired evidence or unexpected target state. A cancelled/disconnected job can leave remote work active. Record the last confirmed action, reconcile the underlying Foundation/Prism/task state and obtain a fresh approval where required before another submission. Do not automatically retry password changes, deletion, imaging or encryption. Rolling back the appliance does not undo target changes.

## Evidence to keep

Keep operator/time, installed version, exact target identity, config filename/hash, approval and job/task/run IDs, redacted logs, before/after target checks and unresolved follow-up in the change record. Keep passwords, tokens, private keys and key backups in approved secure storage. Protect YAML containing password overrides or session values. Public examples use documentation addresses and generic names only.

## Scope

This collection covers the UI workflow/script catalogue, retained retired entries and dedicated operator flows. It is not an instruction to run every repository maintenance, test or packaging helper. No live cluster changes or hardware validation were performed in preparing the guides. Retired Native executor, NKP and ZTF 2.x console paths must not be re-enabled through historical instructions.

## References

- [Administrator and User Guide](../manuals/README.md)
- [Current source and appliance status](../current-status.md)
- [Console retirement](../console-retirement.md)
- [Return to the guide index](README.md)
