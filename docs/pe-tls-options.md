# PE TLS options for deployment and recovery

Trusted PE certificates are optional for the following operations. New console drafts expose a per-operation exception, with HTTPS encryption retained and an editable deployment/recovery reason. Enable verification whenever the PE certificate is trusted. Saved plans retain their reviewed choice; changing a transport policy requires a fresh plan and approval.

| Operation | Where to select the exception | Preserved checks |
|---|---|---|
| AHV Uplink Migration and DARE | PE-direct connection | UUID, prerequisites, approval and readback; uplink SSH pins |
| Change Virtual Switch MTU | PE HTTPS connection | PC trust, switch/host identity, exact approval and MTU readback |
| Cluster Storage Standard | Storage YAML fields below | Exact cluster/default identity, dependency review and approval |
| Post-deployment checks and sequence | PE HTTPS connection | PC trust, identity, approval and acceptance checkpoints |
| Cluster PE health | Selected cluster, PE HTTPS connection | Expected UUID, name, serials, addresses and reported health |
| Recovery PE health | Run preparation and recovery health collection | Successful deployment/bootstrap, membership, freshness and completed work |
| Upgrade Advisor | Uncheck PE certificate verification | PC certificate setting remains separate; read-only inventory |
| PE local users, login title and live drift collection | Explicit saved YAML | Credentials, roles, supported settings and readback |

MTU still uses Prism Central for virtual-switch management; selecting a PE exception does not bypass PC certificate verification or remove its API dependency. DARE has a PE-direct path without PC. SSH operations continue to require pinned host keys. iDRAC is a separate endpoint and retains its own policy. Existing ZTF 1.x pipeline behavior is retained; the new fields apply to the enhanced PE clients listed above.

## YAML policy

Use these top-level fields in storage, local-user and live-monitoring YAML, or inside the PC-managed `connection` of a reviewed plan:

```yaml
pe_verify_tls: false
pe_tls_bypass_reason: Initial cluster deployment or disaster recovery configuration
```

For PE-direct uplink/DARE plans, retain the existing `verify_tls` and `tls_bypass_reason` connection fields. Login-title YAML also retains its existing `prism_login_title_verify_tls` flag. The local-user and title generators emit the selected policy. Omitted flags in older YAML/approvals continue to mean verified TLS; no existing file or approved plan is rewritten automatically.

## Evidence and audit

The selected exception is recorded per operation. Mutation plans retain it in canonical content covered by approval; collection policies appear in health evidence. Certificate-unverified evidence is explicitly marked `tls-exception-pe-readback`. New runs retain the selected health collection policy for automatic readback after bootstrap. A successful read still requires the existing identity/membership/health checks and does not establish NCC, resilience or application readiness. Failed collections never pass the recovery health gate. Step 08 registration-only retry still requires reconciliation and fresh health evidence and does not replay completed steps.

Bypassing certificate verification leaves PE server identity unauthenticated and permits impersonation on an untrusted network. It does not disable HTTPS encryption, change global trust, follow redirects, or weaken SSH host-key checks. Use only for the selected reviewed target and operation.

## Validation boundary

Automated tests and browser rehearsals use mocked PE/PC/SSH endpoints. Hardware mutation gates remain unchanged; no live cluster changes are performed during this update.
