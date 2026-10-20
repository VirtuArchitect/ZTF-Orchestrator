# Create Local Users (PE)

Updated source builds expose `CreateLocalUsersPe` in **Scripts 1.x** and
**Pipelines**. This is a community extension to the bundled ZTF runtime, not
the Prism Central `AddLocalUsers` operation. Environment-specific PE API UAT
is required before production use. It creates Prism accounts, not CVM, AHV,
iDRAC or Orchestrator accounts.

## Prerequisites

- Sign in to Orchestrator as an administrator. Operators and viewers cannot run
  this privileged script, including through a pipeline.
- Have an existing PE credential authorized to manage local users and roles.
- Trust the PE certificate chain in the container and use a PE IP present in
  its certificate SAN. TLS verification cannot be disabled by this script.
  See [PE certificate trust](live-pe-drift-monitoring.md#trust-and-api-compatibility).
- In Global Config, add the connection credential and eight separate user
  credential references. Each new credential's username must match its YAML
  username, and each password must be unique and satisfy the PE password policy.
  Use your approved vault provider; do not put passwords in this YAML.

## Eight-User Configuration

Save as `pe-local-admin-users.yml`, replacing the documentation IP, cluster
name, usernames and credential reference names with your approved values:

```yaml
clusters:
  192.0.2.10:
    name: example-cluster
    pe_credential: pe_user
    local_users:
      - {username: ops.admin01, credential_ref: pe_ops_admin01}
      - {username: ops.admin02, credential_ref: pe_ops_admin02}
      - {username: ops.admin03, credential_ref: pe_ops_admin03}
      - {username: ops.admin04, credential_ref: pe_ops_admin04}
      - {username: ops.admin05, credential_ref: pe_ops_admin05}
      - {username: ops.admin06, credential_ref: pe_ops_admin06}
      - {username: ops.admin07, credential_ref: pe_ops_admin07}
      - {username: ops.admin08, credential_ref: pe_ops_admin08}
```

Optional `first_name` and `last_name` strings are supported per user. The list
supports 1-50 users per cluster; eight is the wizard default, not a PE limit.
These are privileged accounts: both `ROLE_CLUSTER_ADMIN` and `ROLE_USER_ADMIN`
are assigned. Use individual ownership and grant these roles only when needed.
No Prism Central privileges are granted.

## Scripts and Pipelines

1. Open Scripts 1.x, select **Create Local Users (PE)** and generate YAML using
   the PE endpoint, connection credential and username/reference pairs.
2. Review and save the configuration. Use **Dry Run** to validate structure and
   resolve every credential reference without contacting PE or creating users.
   This does not prove API compatibility, authorization or password acceptance.
3. Run the script and acknowledge the privileged action with exactly
   `RUN CreateLocalUsersPe`. Review every per-user result.
4. Alternatively, create a pipeline, choose **Create Local Users (PE) (Script)**,
   and select the saved configuration. Place it after initial PE password,
   EULA and baseline configuration steps. Use the exact combined confirmation
   requested by the UI when password-change and user-creation steps are present.
   The user-creation step runs a private snapshot of the configuration validated
   at submission, not edits saved while earlier steps are running.
5. Verify the accounts and permissions in PE, then independently test sign-in
   using each intended user's credential. The script verifies existence and
   roles, not each user's interactive login or password expiry state.

The underlying operation uses the bundled PE v1 helper's native profile and
role payload shapes: GET/POST `/api/nutanix/v1/users` and GET/POST
`/api/nutanix/v1/users/{username}/roles`. No PC APIs or SSH commands are used.
The extension uses fresh verified HTTPS reads, bounded responses/timeouts,
no environment proxies and no redirects. It does not use the legacy helper's
default unverified transport or log request/response bodies.

## Existing Accounts and Recovery

All references and usernames are checked before networking. Existing accounts
are inspected before any new accounts are created. Existing accounts with both
requested admin roles are verified and skipped; their passwords are unchanged
and are not tested against the saved new-user credentials. Existing non-admin,
disabled or case-conflicting accounts stop the run rather than being elevated
or reset. Built-in names and duplicate names/references are rejected.

Creation and role assignment are separate API operations, not an atomic batch.
If PE rejects a password, role assignment or verification, the step fails and
later pipeline steps are skipped. Previously created accounts remain. Inspect
PE before retrying; a created account missing its roles needs explicit manual
review. There is no automatic rollback, account deletion, privilege escalation
of pre-existing users, or password reset on retry. API response variants not
recognized by this extension fail closed and require compatibility validation.
