# CVM and Dell iDRAC password rotation

This Orchestrator-managed workflow targets the CVM `nutanix` SSH account on
AOS **7.5.1.8** and existing **Dell iDRAC** local accounts. Implementation and
mocked verification are available; live validation on those versions is still
required before production use. Prism admin and AHV passwords are outside scope.
The AOS version is operator-declared in the intent; installed-version discovery
is not performed. Confirm the actual cluster version before approval, and keep
referenced credential values unchanged between approval and execution.

## Prepare and run

1. In **Global Config → Credentials**, create distinct current and replacement
   references. Keep the username unchanged; CVM references must use `nutanix`.
   Preserve both references until rotation, recovery, and consumer updates finish.
2. Open **Workflows → CVM & iDRAC Password Rotation**. Enter every CVM in one
   cluster, sharing the same credential references. Supply each CVM's SHA256 SSH
   host-key fingerprint obtained through a trusted channel. An unauthenticated
   network key scan alone does not establish identity. Inventory must match
   `svmips` before changes are allowed.
3. Enter iDRAC addresses and credential references. The service must trust their
   HTTPS certificates, including IP address identity. Configure the service trust
   store appropriately; TLS verification cannot be disabled in this workflow.
   HTTP proxies and redirects are disabled for these requests.
4. Acknowledge the manual IPMI metadata follow-up when selecting iDRACs. Run
   **Dry Run** to authenticate and check targets without mutations.
5. Request approval for the exact generated YAML through the existing approval
   process. Another administrator must approve it. Run as an administrator and
   type `ROTATE CVM AND IDRAC PASSWORDS`. Each approval permits one submitted
   mutation job; general approval settings cannot disable this requirement.
6. Review per-target results. Update connection-profile references and external
   consumers only after verified results.
7. **Synchronize the corresponding Nutanix host IPMI credentials through the
   supported procedure for your AOS release.** This workflow changes iDRAC
   passwords but does not update that cluster metadata or verify cluster power
   actions. Complete this follow-up before relying on power operations.

Dry Run requires an administrator but no mutation approval. It performs online,
read-only authentication checks. Failed authentication can count toward remote
account lockout policy.

## Behavior and recovery

All selected targets pass read-only checks before any password changes. The CVM
password changes **once**, using interactive `sudo passwd nutanix`. Replacement
password SSH authentication is checked on every CVM, allowing a bounded cluster
synchronization interval. iDRAC accounts are discovered by username, changed
sequentially through Redfish, and verified by a fresh authenticated account read.
The workflow waits ten seconds for CVM synchronization, then attempts one new
password login per CVM. It does not repeatedly retry authentication failures.

The configured legacy ZTF Python environment supplies SSH support. The bundled
ZTF v1.5.2 requirements already include Paramiko; no runtime dependencies were
added. A runtime without SSH support fails CVM preflight before mutations.
Passwords travel to the SSH helper through stdin, never shell commands, process
arguments, configuration files, or job logs. Remote output and transport exception
text are excluded from retained logs.

Success means selected passwords changed and replacement logins were verified.
**It does not mean IPMI metadata or external consumers have been updated.**
Diagnostics retain `followupRequired` and `nutanixIpmiMetadataUpdated: false`.

Failure stops subsequent changes. `verified` means replacement authentication
worked; `change_attempted` means the final password state is uncertain. A timeout
after a write may leave the new password active. Cancellation is checked between
operations; an in-flight change can finish before cancellation takes effect.
Attempt and verification events are retained as execution advances. Mutations
are never automatically retried or rolled back. Inspect the actual target before
requesting another approval. Exclude verified iDRAC targets from recovery runs.
Recover a partially synchronized CVM cluster through the vendor-supported
procedure before rerunning the cluster-wide workflow.

## Vendor references and validation boundary

- [Nutanix Security Guide](https://www.nutanix.com/content/dam/nutanix/documents/certifications/nutanix-security.pdf)
  documents `sudo passwd nutanix` and cluster synchronization. This public guide
  predates AOS 7.5.1.8; release-specific live validation remains required.
- [Dell iDRAC Redfish scripting](https://github.com/dell/idrac-redfish-scripting)
  provides vendor-maintained account management examples. Firmware capabilities
  and password policy require target-environment validation.
- [DMTF Redfish specification](https://redfish.dmtf.org/schemas/DSP0266_1.20.1.html)
  defines account password updates. This adapter supports Password PATCH; services
  requiring a ChangePassword action require a separate verified adapter.
