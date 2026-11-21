# Packaged workflow enablement security review

Scope: enable the existing uplink, create-switch, DARE and VS0 MTU execution capability flags in Docker/appliance images and Compose. Direct source defaults and backend authorization/verification code are unchanged. This deliberately changes the packaged deployment boundary from planning-only to live-capable.

Image defaults are overridden by explicit container environment values. Both supported Compose definitions pass the four values, with defaults of true, so site-managed false values remain authoritative. Existing custom false overrides are not rewritten during an image update. Password setup, Foundation, NCC and other workflow capability flags are outside scope.

Review confirmed unchanged admin-only endpoints, independent exact-content approvals, requester/approver separation, typed confirmation, fresh target checks, cancellation, per-host/task verification and uncertain-operation reconciliation. No new command, remote endpoint, role, stored schema, credential, runtime dependency or automatic startup job was added. PE TLS policy, PC certificate trust and SSH pins are unchanged. Existing pipelines and recovery retry logic are not edited.

Regression tests cover capability display for true and false values, unauthenticated denial, rejection of application without a reviewed approved plan, and unchanged mocked application/verification behavior. Image smoke must check default true without injected flags and explicit false overrides in network-disabled containers. Hardware/API compatibility, actual uplink connectivity and DARE key recoverability remain separate site acceptance checks. Application rollback cannot undo accepted remote changes.
