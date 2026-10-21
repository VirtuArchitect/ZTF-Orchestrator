# PE Post-Configuration Verification

This applies to updated source-derived v1.8.5-rc1 builds. It is not a stable
release promotion or evidence that a production cluster has been changed.

## Password Handoff

1. Store the approved replacement password under a separate credential reference
   whose username is exactly `admin`. Keep the old reference until verified.
2. Only the first password-change file should contain `new_pe_admin_credential`.
   The legacy change action uses the shipped default as its old password unless
   `default_pe_password` is explicitly supplied. `pe_credential` alone does not
   supply that old-password argument. Protect any explicit override as a secret.
3. Review the YAML and obtain the normal authorization/approval and exact
   confirmation required by the chosen workflow or standalone script.
4. The action changes the password, then creates a fresh session using the
   replacement credential and reads the PE cluster identity at
   `/api/nutanix/v2.0/cluster`, without duplicating the resource path. A rejected login,
   network failure, empty identity or unresolved credential is not success.
   Verification failure exits nonzero before later configuration is started.
5. Within a combined Configure Cluster run, the verified session and credential
   reference are handed to its remaining actions. Saved credential values and
   other saved YAML files are not rewritten.
6. In all subsequent files, set `pe_credential` to the replacement reference and
   omit `new_pe_admin_credential`. The password substep reports `SKIP`, with no
   password-change or replacement-authentication request for that substep.
7. Independently confirm the new Prism login. Do not automatically retry after
   an ambiguous change failure; establish which password actually works first.

This fix does not replace the legacy ZTF HTTPS transport or establish certificate
trust. `secured=True` selects HTTPS in that runtime, not a new TLS trust guarantee.
Preserve your approved certificate configuration and management-plane controls.
The separate live-drift and local-user clients retain their verified-TLS gates.

## Container Readback

The runtime reads the container inventory after creation and checks every
explicitly requested supported property against the matching container:

- RF, advertised capacity and reserved capacity.
- Compression and delay, erasure coding, fingerprint-on-write and on-disk dedup.
- Software encryption, storage-pool UUID and affinity-host UUID when requested.
- The empty NFS whitelist supported by the legacy creation helper.

Numeric string readbacks are normalized without rounding; booleans and ON/OFF
switches are type-checked. Capacity fields ending in `_in_gb` retain the legacy
binary conversion of 1 GiB = 1,073,741,824 bytes. This change does not alter units.
Unspecified properties are not asserted. Missing API fields cannot prove a match.
Unknown property names, invalid values, duplicate request names and unsupported
nonempty NFS whitelists are rejected before container creation.

An existing matching container passes without mutation. A missing, duplicate or
mismatched readback fails verification; the runtime does not alter existing
containers to repair differences. Logs identify mismatched field names without
dumping API response bodies or credentials. Review differences and authorize any
separate repair explicitly.

## Pipeline Gates and Recovery

Ordinary nonzero exits and ERROR/CRITICAL logs fail the step. Zero-exit `FAIL`
verification summaries also fail; `CAN'T VERIFY` for password change, EULA, Pulse,
container creation or PC registration fails rather than advancing the pipeline.
An explicit password `SKIP` is not a failure. Existing approval, RBAC and run
confirmation controls remain in force; no approval bypass is introduced.

Configure Cluster runs some unrelated actions concurrently within a single step.
A container failure stops later pipeline steps, but does not undo other actions
already running inside the failed step. Use narrowly scoped YAML files for
sensitive stages, inspect partial results and independently verify the target.

Validate a successful change and each rejection case in a disposable UAT target
before production rollout. Automated fixture tests do not constitute live PE
password-change, storage-configuration or certificate-trust UAT.
