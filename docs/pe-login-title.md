# Set Prism Login Title (PE)

Current application baseline: `a3c9c79`; consolidated appliance bundle
`v1.8.5-rc1-636f191`. See [current build and documentation status](current-status.md).

Updated v1.8.5-rc1 source adds **Set Prism Login Title (PE)** to Scripts and
pipelines. Its internal identifier is `SetPrismLoginTitlePe`. It changes the
large title on the Prism Element login screen. The cluster name, CVM/host names,
browser-tab title, blurb, colors, welcome banner and authentication settings are
not changed.

## Compatibility and support boundary

Nutanix documents **Title Text** customization under Prism UI Settings in the
[Prism Element Web Console Guide](https://www.nutanix.com/content/dam/nutanix/documents/certifications/prism-element-web-console-guide.pdf).
This extension integrates the legacy UI system-data contract at
`/PrismGateway/services/rest/v1/application/system_data`, using
`CUSTOM_LOGIN_SCREEN` / `product_title`. The contract is also visible in the
published [REST client source](https://nutanix-api-library.readthedocs.io/en/latest/_modules/ntnx_api/prism.html).
No third-party client code or new dependency is bundled.

Application integration and simulated/runtime tests do **not** establish a
Nutanix-supported public API, an AOS compatibility matrix, or a successful live
change. Verify this operation on the exact target AOS version before production
rollout. An unsupported endpoint or unexpected response fails closed; there is
no SSH/file-edit fallback. Older appliance images do not acquire the extension
by importing YAML alone.

## Prepare credentials and trust

1. In **Global Config > Credentials**, configure a reference such as
   `pe_admin_current` for the existing PE administrator account and current password.
2. Select the vault containing that reference and **Save to ZTF**. The lookup must
   succeed in that selected vault; a similarly named entry elsewhere is insufficient.
3. Configure persistent certificate trust in the application container, and use
   a PE IP present in the certificate SAN. TLS verification defaults to `true`.
   The existing [certificate guidance](pe-local-users.md) describes container trust.

Save a separate configuration file, for example `set_pe_login_title.yml`:

```yaml
pe_credential: pe_admin_current
prism_login_title_verify_tls: true

clusters:
  "192.0.2.10":
    name: "DC1-AHV-01"
    prism_login_title: "DC1-AHV-01"
```

A per-cluster `pe_credential` overrides the root default. A per-cluster
`prism_login_title_verify_tls` overrides the root TLS option. An explicit `false`
is supported only for this operation and generates a warning; it disables
certificate and server-identity verification for that client, not globally.
Trust the correct certificate rather than treating `false` as a trust fix.

Each title must be 1-128 nonblank plain-text characters, with no markup or
Unicode control/format characters. Every target needs an existing cluster
`name` and a credential reference. Targets are explicit PE IP addresses on HTTPS
port 9440. Titles are preserved exactly; the implementation does not silently trim
or convert them. Keep passwords out of configuration files.

## Run from Scripts or a pipeline

1. Open **Advanced Automation > Scripts**, select **Set Prism Login Title (PE)**,
   and enter the target, cluster name, reference and title.
2. Review or import the generated YAML and save it.
3. Run **Dry Run**. It validates structure, title constraints, TLS flags and all
   selected-vault references without PE requests or writes. It does not prove
   connectivity, target permissions, API compatibility or the target's current title.
4. Add **Set Prism Login Title (PE)** and the saved file as its own pipeline step.
   Keep it after any required password change, using the current administrator
   credential reference. Existing pipeline approvals/acknowledgements remain applicable.
5. As an administrator, review the exact target and run the step. Do not rerun
   Foundation imaging or unrelated post-configuration stages for a title change.
6. Require a fresh read-back PASS, then open a new private browser window at PE
   and verify the login screen. An already open browser can show cached branding.

The equivalent CLI in an updated bundled ZTF runtime is:

```sh
cd /opt/zerotouch-framework
/opt/ztf-python/bin/python main.py \
  --script SetPrismLoginTitlePe \
  -f /var/lib/ztf-orchestrator/configs/set_pe_login_title.yml
```

## Existing Configure Cluster YAML

The title-only YAML above can also use `config-cluster` in an updated runtime.
An early dispatch runs only this extension, before legacy PE object construction,
and returns without running password, EULA, Pulse, storage, networking or registration
actions. Existing workflow approvals remain enforced.

Do not mix login-title fields with other per-cluster configuration fields or with
clusters that have no requested title. Such requests fail validation and must be
split into separate pipeline steps. This prevents accepted-but-ignored title
fields and unrelated baseline actions.

## Verification and recovery

All credentials resolve before target contact; current-title reads for every
target succeed before the first write. An absent title creates one setting; an
existing title updates only that setting. An already matching title is an
idempotent no-op with a fresh verification read. Unknown responses and duplicate
title records are rejected. A second pre-write read detects a changed baseline;
it is not an atomic compare-and-swap guarantee against external administrators.
Per-target OS file locks in the shared application data directory prevent two
local script processes from changing the same target concurrently. Busy targets
fail before any PE request. Locks are released on process exit, including crashes;
the small lock files remain and must not be deleted while operations are running.
Instances with separate data directories are not coordinated by these locks.

Results include `Prism_Login_Title: PASS`, `changed`, `previous_title`,
`requested_title` and `verified_title`. A successful HTTP acknowledgement alone
does not count as success. Verification mismatch or transport failure makes the
script/pipeline step fail with a nonzero exit code. Errors distinguish credential
resolution, TLS trust/identity, connectivity, HTTP access, unsupported API and
read-back failures without logging passwords or raw upstream bodies.

Writes are not automatically retried. After an apply/verification error, inspect
the actual current title before retrying: the write may have succeeded even when
its acknowledgement or read-back was lost. A multi-target run is not transactional;
earlier targets may have completed. Preserve the results and review each target.

To restore a previously configured title, submit its recorded `previous_title`
as the desired title and verify again. A missing original setting (`null`) cannot
be exactly restored by setting a string: this extension does not delete UI data.
Use Prism UI Settings for that case, or when a legacy title exceeds the new
plain-text input constraints. No automatic rollback or broad UI-settings
replacement is performed.
