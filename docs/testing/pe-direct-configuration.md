# PE-direct configuration validation

This implementation adds optional PE-direct transports to the existing AHV Uplink Migration and DARE wizards. Existing PC-managed plans, ZTF 1.x pipelines and recovery execution are retained. There is no data migration or global TLS policy change.

## Automated coverage

- PE identity, complete AHV membership and Good health; rejected identity mismatch, incomplete membership, unsupported encryption/KMS state and stale plans.
- Uplink discovery without PC, exact CVM host-key inventory, physical serial/address checks, minimum retained/destination links, structured OVS parsing and duplicate-identity rejection.
- Sequential retain/create/attach operations, retained management readback, per-host verification, preservation of completed results, stop after failure and final all-host drift detection.
- A single PE encryption enable request; ambiguous submission is never automatically replayed. Configuration readback is separate from background encryption and key-backup acceptance.
- Administrator-only endpoints, independent approval, denied self-approval, changed-plan rejection, one job per approval, and denial before writes after an approver loses administrator privileges.
- Explicit boolean TLS verification, mandatory bounded exception reason, control-character rejection, default verified contexts, HTTP status sanitization, prohibited redirects and preserved SSH host-key checks.
- Browser exercises for both PC and PE-direct paths, hidden PC fields, mandatory exception reason, exact confirmation, per-host results and a fresh DARE review restoring TLS verification.

Run:

```sh
python -m pytest tests/test_pe_direct_configuration.py tests/test_ahv_uplink_migration.py tests/test_dare_workflow.py tests/test_virtual_switch_mtu.py tests/test_release_integrity.py -q
npm run build
npx playwright test tests/visual/ahv-uplink-migration.spec.ts tests/visual/dare-wizard.spec.ts
```

For an isolated Linux image rehearsal, mount only the test directory read-only into `/app/tests`, set Docker networking to `none`, use a read-only root filesystem with a temporary `/tmp`, and run `python /app/tests/rehearse_pe_direct.py`. The rehearsal creates temporary file-backed users, approvals and jobs and replaces every PE/SSH target with simulated endpoints. Its mutation flags apply only to that disposable process. Never mount appliance data or pass production database settings to this rehearsal.

## Security review

The HTTP transport permits fixed PE v2 operations over HTTPS on the reviewed endpoint. TLS bypass is explicit, visible in approval notes, bound to canonical content and recorded in structured audit events and job diagnostics. It neither changes other workflow transports nor disables CVM or CVM-to-AHV SSH host-key verification. Credentials resolve from saved references, are passed to the SSH subprocess over stdin, and are excluded from command arguments, response bodies and exception output. Fixed, validated commands prohibit arbitrary bridge/NIC/bond command text. Existing runtime dependencies are reused.

Requesters and independent approvers must remain administrators at execution time. Every uplink mutation rechecks authorization; uncertain operations require reconciliation. A TLS exception accepts the risk that an HTTPS peer can impersonate PE. UUID checks are logical checks and do not restore certificate authentication. The exception reason must contain no secrets.

## Remaining acceptance work

Mocked success does not establish vendor certification or representative hardware support. Packaged builds enable reviewed application by default; explicit false overrides retain planning mode. Before production use, validate the exact AOS/AHV API responses, Local KMS eligibility/licensing, CVM `manage_ovs` availability, strict CVM-to-local-AHV SSH access at `192.168.5.1`, bond naming/MTU behavior, real management and workload connectivity, timeout behavior and the out-of-band recovery procedure. PE v2 encryption has no revision token for this operation; coordinate an exclusive change window and monitor independent Prism tasks. Encryption is irreversible and requires separate key-backup verification. Live writes remain disabled by default.

- [AHV Uplink Migration operator guide](../ahv-uplink-migration.md)
- [DARE operator guide](../dare-workflow.md)
