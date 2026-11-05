# Cluster-focused operations

Source addition for v1.8.5-rc1. This guide describes the managed-cluster workspace,
persistent attention records and read-only PE observations. It does not change
the contents of previously published appliance bundles or promote the prerelease.

## Overview and cluster records

**Overview** retains Deploy, Configure, Recover and Monitor shortcuts, existing
recent jobs and the platform-details panels. Managed-cluster records now link
configuration filenames, a post-configuration pipeline and an optional recovery
profile. Existing recovery-profile listings remain under **Clusters**. An empty
managed-cluster list is not evidence that no clusters exist.

1. An administrator opens **Clusters > Add cluster record**.
2. Enter the exact PE cluster name, datacenter label, operational owner and PE
   HTTPS origin. Enter a credential reference, never a password. Datacenter labels
   organize these records; saving one does not create a Disaster Recovery
   datacenter or modify credential/configuration groups.
3. To enable PE readback, enter the independently established cluster UUID and
   complete physical membership as JSON entries with `serial`, `hostIp` and
   `cvmIp`. Obtain these through an approved independent source. Do not guess a
   UUID or accept one automatically from an unverified endpoint. A record may be
   saved without this baseline; its health collection stays disabled.
   Optionally select a saved **Foundation deployment file**, read its expected
   membership and choose the intended cluster. This copies only the cluster name,
   VIP and node serial/AHV/CVM addresses into the draft. It imports no passwords or
   credential references, clears any previous UUID, and does not save or execute.
   Independently establish the actual UUID and review the imported baseline.
4. Select existing configuration filenames, a pipeline and, optionally, a recovery
   profile. Inspect their real targets before execution. These are operator
   associations, not authorization or proof of target identity. A shared file can
   associate a job with several records; the recent-job view does not choose one
   arbitrarily.
5. Select **Save cluster record**. No infrastructure is contacted, configured or
   deployed. Editing a record uses a revision check to reject stale writes.

Record edits do not rewrite YAML, rename credential references, change a recovery
snapshot, create an approval, or submit a workflow. Editing expected identity,
membership, PE endpoint or credential reference discards the old observation.
Changing the owner or organizational links retains it with its original time.

## PE-reported health

Administrators and operators can explicitly select **Collect PE health
(read-only)**. Viewers can inspect recorded observations but cannot collect.
Opening or refreshing Overview/Clusters does not contact PE. No background PE
schedule is added by this feature.

Collection resolves the current credential and makes two fixed GET requests:

- `/PrismGateway/services/rest/v2.0/cluster/?include_health_summary=true`
- `/PrismGateway/services/rest/v2.0/hosts/?include_health_summary=true`

HTTPS certificate and hostname verification are mandatory. The approved CA chain
must be present in the effective container trust configuration. No TLS exception,
redirect or environment proxy is accepted. Existing transport bounds remain:
10-second timeout and 1 MiB maximum response per request. No raw API bodies,
passwords or authorization headers are retained.

**PE-reported health: Good** requires the expected UUID and cluster name, complete
host inventory, matching node serials/AHV/CVM addresses, and explicit PE-reported
`Good` cluster and host health. Explicit supported negative health values produce
an attention state. Authentication, trust, connectivity and unparseable responses
have a separate **Collection failed** outcome. Completed responses with missing
health fields or mismatched identity/membership remain **Unknown / review required**.
A failed new collection replaces the previous result; it does not preserve an old
green badge.

Every result displays its collection time. After 15 minutes it is shown as
**Evidence expired** and excluded from the fresh-Good count. Collection failures, invalid timestamps and clock mismatches are reported separately; see [PE health reporting](pe-health-reporting.md). Browser wall-clock skew warns separately without expiring valid appliance-time evidence. Job success and
manual recovery attestations never populate this badge. These checks do not
establish NCC compliance, storage resilience, backup restorability, workload
availability, or final recovery acceptance.

An in-flight collection is serialized per record. If the record changes while
collection is running, the result is discarded rather than attached to another
baseline. Fresh observations do not unlock recovery or workflow execution gates.

## Persistent attention

The operational summary materializes observed failed/interrupted durable jobs,
recovery runs requiring reconciliation and failed/stale managed PE observations.
It considers the retained queue history, not only the five recent activity rows.
Once observed and stored, a failed-job review survives later queue-record removal.
Failures deleted before this feature observes them cannot be reconstructed.

Administrators/operators can select **Update review**, assign an owner and record
review/reconciliation notes. Acknowledgement requires an owner and notes;
resolution requires notes. No secret belongs in those fields. Resolved records
remain available through **Include resolved records**; the latest 100 explicit
review entries per item are retained. Status changes and their actor are audited.
Concurrent stale review saves are rejected. Viewer access stays read-only.

Acknowledgement does not resolve the target or mark a workflow successful. Later
successful collection does not silently close an existing review. A new failed
readback, or a readback becoming stale, can reopen an observation review. Sources
unavailable during a refresh are shown as unavailable/stale, not as an all-clear.

## Continue existing recovery work

A linked record opens the existing recovery run with `?run=<id>`. This performs
only a read; it never re-submits Foundation or starts configuration. Use the
existing approvals, bootstrap, health window, reconciliation and successful-job
linking controls. Completed jobs remain recorded.

Recovery overview/run polling now waits for each read to finish, pauses when the
tab is hidden, honours bounded `Retry-After` values and backs off after errors.
An open run displays its last successful refresh and an explicit stale warning
after read failures. HTTP/non-JSON errors never cause automatic execution retries.

## Appliance indicators, storage and rollback

Overview shows application health, the latest database-backup record time,
administrator-only host-update-service availability and the reported installed
build. A backup record is not labelled restore-verified. Unavailable dependency
data stays unavailable; the indicators do not replace a host restore drill.

Operational metadata is an additive `cluster_operations.json` document in the
existing file/PostgreSQL store. Existing backups include it. No SQL migration,
runtime dependency or new vault is required. Corrupt metadata fails closed rather
than being silently reset. The existing single-application-process coordination
boundary remains; this is not distributed cluster ownership or multi-tenant ACLs.

During rollback, an older application ignores the new document. Preserve it with
normal backups; do not delete operational history to clear workflow gates. The
feature does not change saved automation, existing URLs, target credentials,
deployment backends, approval policy or infrastructure state. Returning to an old
image does not undo any infrastructure work executed separately by an operator.

## Validation scope

Isolated API/service tests cover roles, input/reference checks, storage conflicts,
retained failures, fresh/stale observations, identity mismatches, pagination,
failed transport, and collection races. Browser fixtures cover registration,
read-only viewing, review ownership/resolution, mobile layouts and polling errors.
No physical cluster health acceptance or deployment is implied by those fixtures.

Related: [Disaster Recovery](disaster-recovery.md),
[PE drift](live-pe-drift-monitoring.md),
[credential groups](credential-groups.md),
[configuration groups](config-file-groups.md),
[guided updates](guided-appliance-updates.md).
