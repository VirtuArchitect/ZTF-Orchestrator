# Initial Host & CVM Password Setup

This optional action changes the selected CVM and AHV account passwords over
pinned SSH. It does not require Prism Central or HTTPS CA provisioning. It does
not change Prism Element credentials; keep the existing
`initial_config_admin_pwd` / `ChangeDefaultAdminPasswordPe` step.

The implementation targets observed **AOS 7.5.1.8 or newer** and **AHV
11.0.1.3-23 or newer**. Unknown version formats, older versions, mismatched
membership, missing/locked accounts, changed SSH identities and unsupported
authentication policy stop execution. Numeric minimums are not evidence that
every later release has been hardware-validated.

## Availability and validation boundary

Open **Configure → Initial Host & CVM Password Setup**, or select the same action
in the pipeline editor. This is a built-in governed action inside the existing
ZTF 1.x pipeline path; it does not reinstate the retired Native executor.

Live writes default to **disabled**. After a separately approved lab validation
of the exact AOS/AHV versions, PAM/sudo policy and CVM synchronization behaviour,
an appliance administrator can enable `ZTF_ALLOW_INITIAL_PASSWORD_SETUP=true` in
the application service environment and recreate that service. Keep it disabled
for the mocked local rehearsal. Dry Run is available without enabling writes.
Docker/application rollback does not undo passwords already changed on nodes.

## Prepare one cluster

1. In **Global Config**, create distinct current and replacement credential
   references, grouped by the intended datacenter and cluster. CVM references
   use `nutanix`; AHV account references use their actual `root`, `admin` or
   `nutanix` username. The host access reference must be a working `root` or
   privileged `admin` account. Do not embed passwords in the workflow YAML.
2. Supply every CVM and AHV host in this cluster. The read-only `svmips` and
   `hostips` inventory must exactly match the reviewed addresses. CVMs use one
   common current/replacement pair for the cluster-wide password operation.
3. Obtain each endpoint's SSH SHA-256 host-key fingerprint through an independent
   trusted channel, such as the authenticated VM/host console, and record its
   evidence reference. An unauthenticated `ssh-keyscan` alone is not identity
   verification. A rebuild requires fresh reviewed keys; never silently accept
   changed keys or reuse historical verification as proof of a new node.
4. Select the applicable AHV accounts. Preflight checks actual account existence,
   password state, policy and permissions. It does not create accounts, unlock
   accounts or enable direct root SSH. Account password verification uses
   policy-aware local PAM checks rather than treating root SSH availability as
   proof of a password's validity.
5. Run **Dry Run** and review the saved per-target results. This authenticates
   read-only against real endpoints if deliberately invoked; failed logins can
   count toward the endpoint lockout policy. It changes no passwords.
6. Use **Download Config** to export the reference-only YAML, then save it in
   **Config Files**, with the correct grouping. The download button stays visible
   and is disabled until all required fields are complete or a valid configuration
   is imported. Imported configuration filenames are retained.
   **Generate YAML** opens the validated YAML preview without contacting a cluster
   or requesting approval; returning to Configure preserves the form values.
   Request approval for that exact filename and YAML. A different administrator
   must approve it; approval remains mandatory regardless of general settings.
   Settings → Governance displays this workflow as **always required** rather
   than an optional unchecked policy. Generating/downloading YAML and Dry Run
   require no approval; live password changes and recovery resumes do.

## Insert after the existing first step

Keep the existing eight configuration filenames and actions. Add one new saved
action immediately after the PE administrator password step, for example:

| Existing sequence | Action |
|---|---|
| 01 | Existing `initial_config_admin_pwd` |
| 01a, inserted | Initial Host & CVM Password Setup |
| 02 | Existing EULA / Pulse configuration |
| 03 | Existing DSIP configuration |
| 04 | Existing HA configuration |
| 05 | Existing rebuild reservation |
| 06 | Existing storage configuration |
| 07 | Existing Prism login title |
| 08 | Existing PE-to-PC registration |

The editor's execution-position numbers reflect the inserted action; no existing
configuration filename is renamed or automatically modified. Existing pipelines
without this optional action continue through their existing path.

Run the pipeline as an administrator. Enter the password plan's approval ID and
the exact confirmation **`SET INITIAL HOST AND CVM PASSWORDS`**. The existing PE
administration confirmation is still required. An unavailable live gate or
invalid/used approval blocks submission before the first pipeline step executes.

All targets are preflighted before password mutation. The CVM password changes
once through the cluster procedure, followed by bounded synchronization and fresh
replacement authentication on every CVM. AHV changes are performed per host and
account. Every write is checkpointed as `change_attempted` **before** sending it;
only successful replacement verification records `verified`.

The pipeline snapshots configuration contents in memory and persists their
hashes. After successful password setup, known SSH credential fields
(`cvm_credential`, `host_credential`, `ahv_credential`, `hypervisor_credential`
and their `_ref` forms) can use the verified replacement references in a private
per-run configuration copy. Ambiguous reference promotions are rejected. This
does not rewrite Global Config, saved YAML, PE credential fields or external
consumers. Keep other integrations' references and credentials consistent.

## Resume and reconciliation

The workflow panel shows durable run IDs and per-target results. Keep both old
and replacement references until recovery and any external consumer updates are
complete. Passwords are never automatically rolled back or uncertain writes
automatically repeated.

- **Verified:** a resume checks current node identity and replacement
  authentication again, then preserves the completed password operation.
- **Change attempted / needs reconciliation:** independently inspect the target,
  then use the explicit reconciliation controls with notes and an evidence
  reference. The password reconciliation checks authentication; operator text
  alone does not mark a password as verified. CVM synchronization must be
  reconciled as a cluster operation.
- **Uncertain legacy pipeline step:** review its actual outcome independently.
  The separate pipeline reconciliation records an explicit administrator
  attestation of completed or not applied, with evidence. It is labelled as an
  operator claim, not an automatic target readback.
- **Resume a password pipeline:** obtain a fresh exact-intent approval, run the
  original pipeline, and enter the saved password run ID. The pipeline and
  configuration-file hashes must still match. Completed work is preserved;
  uncertain legacy stages block resumption until reconciled.
- **Fresh rebuild:** use the newly reviewed node identities and a new recovery
  run. Old completion records must not cause rebuilt nodes to be skipped.

Recovery profiles accept the optional action after PE bootstrap and retain the
existing PE health, exact-intent approval and final-registration-only retry gates.
The existing step 08-only recovery retry does not replay initial password setup.
No workflow automatically edits existing profiles or approvals.

## Vendor procedure boundary

The [Nutanix AHV Administration Guide](https://www.nutanix.com/content/dam/nutanix/documents/certifications/ahv-admin.pdf)
documents the distinct host accounts and initial password procedures; its public
AHV 6.8 examples are not hardware validation of AHV 11.0.1.3-23. The
[Nutanix Security Guide](https://www.nutanix.com/content/dam/nutanix/documents/certifications/nutanix-security.pdf)
describes the CVM password procedure. Unsupported prompt, PAM, sudo or version
behaviour fails closed and must be validated on the approved lab version before
production enablement.
