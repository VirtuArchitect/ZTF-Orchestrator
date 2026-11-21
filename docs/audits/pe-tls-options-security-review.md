# PE TLS options security review

Scope: per-operation PE exceptions, including PC-managed PE requests; no global SSL override and no PC/iDRAC/SSH trust changes. Optional API/YAML fields are additive; omitted fields preserve old verified behavior. No migration or dependency added.

Reviewed: strict boolean and bounded nonempty plain-text reason validation; canonical mutation intent retains policy and binds approval; changes invalidate frontend review; independent approvals/hardware mutation gates unchanged. GET-only health options reject target overrides and store distinct transport provenance. Existing UUID, membership, credentials and readback checks are not bypassed. No raw error bodies or credential values are added to logging. PC clients retain their own verified context, redirects/proxies remain disabled, SSH pin logic unchanged. Contexts are per-client and exceptions do not load CA files.

Risk accepted by requested behavior: PE certificate authentication is absent on exception runs; identity assertions can be spoofed by an active intermediary. HTTPS encryption alone does not prevent impersonation. Existing approvals cannot silently be converted to exceptions. Saved old YAML remains verified until explicitly updated and reapproved.

Validation: mocked transport/MTU/health policy regression tests, existing workflow suites, frontend build and browser tests. Live hardware/API compatibility and production deployment are outside this verification.
