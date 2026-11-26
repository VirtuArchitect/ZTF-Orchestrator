# Scoped Operator and Viewer workspace (updated source)

This is an intentional access-boundary change. Existing Operator and Viewer
accounts receive no implicit cluster grants. Administrators retain their existing
workflows; no pipeline, approval or recovery record is migrated or rewritten.
New access metadata is stored separately from business records. Global Config
group labels alone do not grant target permissions. Explicit bulk assignments can now select those cluster IDs and opt into datacentre inheritance.

| Capability | Viewer | Operator | Administrator |
|---|---|---|---|
| Assigned cluster and reviewed pipeline summaries | Read | Read | All |
| Structured scoped run and recovery status | Read | Read | All |
| Raw credentials, configuration, logs or exports | Denied | Denied | Existing controls |
| Non-executable action-plan drafts | Denied | Explicit grant | Review |
| Deployment/recovery/change request | Denied | Explicit grant | Review separately |
| Execute exact reviewed cluster pipeline | Denied | Explicit grant and binding | Existing controls |
| Cancel own scoped run | Denied | Explicit grant | Existing controls |
| Approve, edit arbitrary YAML, administer, destructive recovery | Denied | Denied | Existing controls |

### Phase 1: restrict sensitive access

1. Sign in as an administrator and retain an emergency administrator account.
2. Open **Administration > Access Control**. Existing users are managed in
   **Administration > Users**.
3. Verify an unassigned Operator or Viewer opens **Operations workspace** with
   no clusters. Direct links and legacy API calls do not bypass this boundary.
4. Viewer accounts cannot write, execute a remote test, approve work or retrieve
   credentials, raw YAML, configuration backups or raw job output.

### Phase 2: permission profiles and bulk cluster selection

1. Open **Administration > Access Control**. Choose the reusable **Viewer** or
   **Operator** permission profile. Duplicate it to create a named custom profile.
   Cluster visibility is mandatory; sanitised history is optional. Viewer profiles
   cannot grant execution or write capabilities. Profile edits apply to every
   account assigned to that profile and are included in the save review.
2. Select one or multiple accounts of the matching role. Search accounts or use
   **Select matching accounts**. Account roles and existing administrator access
   are never changed by this screen.
3. Search the datacentre/cluster tree, tick individual clusters, or choose
   **Select all existing clusters** within a datacentre. These snapshot selections
   do not grant access to clusters added later.
4. Select **Entire datacentre, including future clusters** only when intentional.
   This inherits current and future cluster groups in that exact datacentre.
   Datacentre renaming requires review and reassignment of inherited access.
5. Choose **Apply selection to draft**, then **Review access changes**. Inspect
   the resulting cluster counts, capabilities and inherited datacentres for all
   affected accounts, then **Save reviewed access**. Saving never connects to PE
   or runs a workflow. Concurrent role, inventory or access changes require a new
   review. Assign an empty cluster selection to revoke an account's bulk access.
6. **Load assignment** retrieves an account's current selection for editing.
   Assignments use account IDs; recreating a username does not inherit grants.
   Existing legacy assignments remain effective until explicitly replaced for
   that account. Advanced legacy policy editing is blocked after bulk adoption.

No PE endpoint, UUID, credential or TLS input is required to assign access.
The selector uses existing Global Config cluster groups and retained legacy
scopes. Shared-service groups are excluded. Unresolved clusters can be assigned
visibility, but cannot receive delegated pipeline execution. Maintain technical
identity separately in **Clusters**: a unique exact datacentre/name match with
an endpoint, expected UUID and PE reference supplies the execution scope, using
certificate verification by default. Existing reviewed scopes retain their
credential allowlists and TLS choice. Ambiguous/duplicate endpoints fail closed.
Additional credential references or PC targets still require an administrator's
reviewed technical scope; labels alone never select execution credentials.

The additive `bulk_access.json` document stores profiles and account selections.
The legacy `access_policy.json`, workflow approvals and recovery journals are
retained. Runtime grants are resolved on every request and before delegated
steps. New inherited clusters still require exact pipeline review before running.

### Phase 3: reviewed execution and operational handoff

1. Prepare the saved pipeline and YAML through existing administrator tools.
2. Select the Operator, saved pipeline and exactly its assigned target scopes.
3. Choose **Review exact pipeline**. Review the ordered actions, configuration
   filenames and SHA-256 intent fingerprint. This is a local review, not a live
   connectivity test.
4. Type the displayed authorisation phrase and authorise. This creates a
   separate delegation record; it does not replace action approval records.
5. The Operator can confirm and execute that exact binding. The runner freezes
   reviewed YAML, rechecks grants and PE UUID before every step, and retains
   existing Governance checks. Changed YAML, scopes, global configuration or
   revoked grants stop delegated execution until a fresh administrator review.
6. Operators and Viewers receive structured status receipts only, never raw
   stdout, stderr or credentials. Refresh status reads stored metadata only.
7. Cancellation stops the local runner and prevents later steps. Remote work
   may already have been accepted: an administrator must reconcile it before
   any retry. An interrupted active receipt also requires administrator review in **Access Control > Interrupted run reconciliation**. Record independent state evidence, confirm remote work has ended and type the displayed run confirmation. The server refuses reconciliation of an active local run. Reconciliation revokes the old delegation and never retries; prepare only remaining work through the existing recovery controls.
8. Deployment/recovery requests and action-plan drafts are planning records.
   Marking a request reviewed does not approve or execute its workflow.

### Supported delegation and preserved recovery

The first delegated execution phase supports only validated reference-only
`config-cluster` tasks: EULA/Pulse, explicit static DNS/NTP/DSIP, HA and rebuild
reservation, supported storage container settings, and explicitly scoped PC
registration. Unknown fields, YAML aliases, duplicate keys, inline secrets,
vault overrides, implicit targets and dynamic global routing are rejected.
Global configuration must contain only vault/provider and static IPAM settings;
its hash is bound into the review. Other global defaults require administrator
execution. Sensitive individual scripts and Host/CVM SSH changes remain
administrator-only, including when requested in an action-plan draft.

Existing administrator pipelines retain their original schema and execution
path. Existing approvals, completed work and recovery journals are not converted.
The eligible step 08-only PE-to-PC recovery retry remains an administrator
action with reconciliation and fresh health evidence; no Operator shortcut
restarts completed steps or bypasses those checks.

### Validation and rollout boundary

Use synthetic accounts and disconnected/mocked targets to verify deny-by-default,
Viewer write denial, cross-cluster rejection, changed-intent rejection, role
revocation and structured output filtering. Preserve a database/data backup and
verify stored pipeline, approval and recovery document hashes after deployment.
The supported appliance remains a single application process; multi-process or
multi-replica access-policy mutation requires a transactional coordination review.
Rolling back to older application code also restores its older permission model;
do not treat that as an equivalent security boundary. SSO/MFA remain optional
roadmap enhancements, required for release only where organisational policy
demands them.
