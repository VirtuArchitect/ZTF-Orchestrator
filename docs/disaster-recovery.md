# Disaster Recovery: datacenters and cluster rebuilds

The **Recovery → Disaster Recovery** section groups cluster recovery profiles by
datacenter. Each profile captures a versioned Foundation VM configuration and a
saved post-configuration pipeline. Recovery runs and rehearsals execute through
the existing governed job APIs. They rebuild infrastructure; VM and application
restoration belongs to the backup platform.

This section is implemented in source for v1.8.5-rc1. It has isolated lifecycle,
API and UI tests. Those tests do not establish live recovery success, recovery
time objectives, vendor certification or cleanliness after a cyber incident.
The existing successful cluster deployment evidence is distinct from validation
of this new coordinator. No new runtime dependencies are required.

![Disaster Recovery console with a datacenter and reviewed cluster profile](assets/disaster-recovery/overview.png)

The screenshot is from an isolated software smoke test with generic fixtures.
It is not a production environment or evidence of a physical recovery run.

## Prepare the recovery baseline

For field-by-field instructions, screenshot examples and PDF/Word downloads,
follow the [illustrated datacenter and recovery profile setup guide](disaster-recovery-setup.md).
It stops at reviewed-baseline verification without preparing or deploying a run.

1. Contain the incident and obtain recovery authorization. Establish trusted
   provisioning networks, credentials, software images and an Orchestrator that
   is outside the compromised trust boundary. Retain forensic evidence separately.
2. Save a valid **Cluster Create (Foundation VM)** configuration for one cluster.
   Include the real node identities, endpoint, images/checksum, network settings
   and credential references. Test the normal workflow's non-mutating validation
   and certificate/credential checks. Saving a recovery profile does not perform
   these live checks or prove that the dependencies are reachable.
3. Save the post-configuration pipeline. Each step must target only that cluster
   VIP and exact cluster name. Supported actions are **Configure Cluster**,
   **Change Default Admin Password (PE)** and **Create Local Users (PE)**.
   Keep passwords in the existing credential store, not the YAML. The recovery
   snapshot parser rejects literal password, secret, token and private-key fields.
4. Open **Disaster Recovery → Add Datacenter**. Give it a name, the Foundation VM
   HTTP(S) origin (for example `http://foundation.example.com:8000`), recovery notes
   and a review status for networking, images, credentials, DNS/NTP and backup
   access. These are dated operator reviews, not automatic connectivity probes.
5. Select **Create Recovery Profile**. Choose the datacenter, existing/new cluster
   classification, saved deployment file and pipeline. Optionally import a saved
   observation file. Observations remain separately labelled operator imports;
   they do not replace the approved desired configuration or imply live discovery.
6. Open the profile, inspect the deployment YAML, target node set, pipeline steps
   and SHA-256 fingerprint. Record baseline review notes. Every recapture adds an
   immutable revision; old revisions remain available for inspection. Execution
   preparation uses the latest reviewed revision.

Saved-file or pipeline changes flag the profile for review and block deployment
of a prepared run until a matching baseline is captured and reviewed. Credential
references are frozen; resolved secret values are not. Revalidate credential
availability and correctness before execution. Baselines are desired-state
snapshots, not automatic exports of all current cluster settings.

## Rebuild or rehearse

1. Choose **Prepare Recovery** or **Prepare Rehearsal** from the reviewed profile.
   Both prepare an immutable run. **A rehearsal performs real destructive changes**
   when deployed; use explicitly approved rehearsal targets. Preparation itself
   submits no deployment jobs.
2. Request deployment approval from the run. A different administrator must
   approve the exact run YAML in **Approvals**. Baseline review alone is not
   execution approval. Approval must be unexpired, unused and match the exact
   configuration and run-specific filename.
3. Review the cluster name, VIP, nodes, endpoint and baseline hash. Enter both
   `REFOUNDATION <cluster-name>` and `DEPLOY FOUNDATION VM`, acknowledge imaging
   risk and deploy. Existing administrator, mutation, validation and approval
   gates still apply. One Foundation endpoint or overlapping node set cannot
   have concurrent deployments through this application process.
4. Follow the linked deployment job for Foundation's phase/node telemetry and
   logs. A failed, interrupted or uncertain deployment requires reconciliation.
   No automatic imaging retry or rollback is performed.
5. After job success, complete **Initial access bootstrap before PE health
   verification** when the pipeline begins with narrowly scoped password,
   EULA/Pulse steps. A bootstrap file must contain only a single `clusters`
   mapping with `name`, `pe_credential`, optional `new_pe_admin_credential`,
   `eula` and `enable_pulse`. Broader settings, global overrides and local-user
   creation cannot run before health verification. Do not simply label arbitrary
   first steps as bootstrap. The reviewed snapshot is not rewritten or split.
   Request each required **Bootstrap Step Approval**, have its exact YAML and
   generated filename approved in **Approvals**, then enter the returned IDs.
   Enter `BOOTSTRAP <cluster-name>` and acknowledge the reviewed password/EULA/
   Pulse changes. A dedicated password script also retains its exact `RUN`
   confirmation. Select **Run Approved Bootstrap**. Approval policy remains
   enforced; deployment approval does not approve configuration steps.
6. Bootstrap runs sequentially and stops before other pipeline settings. Failure,
   ambiguous submission or service restart requires reconciliation, never an
   automatic password retry. After success, read-only PE collection uses the
   reviewed post-bootstrap credential reference, verified HTTPS and fixed API
   GET paths. It checks cluster UUID/name/VIP, complete expected host inventory,
   node serials/AHV/CVM addresses and explicit PE-reported `Good` cluster/host
   health. Missing fields, unsupported responses, TLS or authentication failures
   remain unknown and block continuation. These API readbacks are not full NCC,
   storage resilience or final recovery acceptance tests. Use **Collect PE Health
   Readbacks** to retry only these reads. If automatic evidence is unavailable,
   independently open PE after bootstrap and record the existing **Independent PE
   health evidence** attestation. Start remaining configuration within 15 minutes
   of fresh health evidence. Collection does not start the remaining pipeline.
7. Select **Run Remaining Pipeline Steps**. Eligible steps are submitted
   sequentially as durable jobs from the immutable snapshots. PE scripts require
   their exact `RUN <script-id[,script-id]>` acknowledgement. The initiating
   administrator's session is rechecked on each submission; expiry or changed
   permissions stop further submissions. No session token is stored in recovery
   records. A failed or unverified step prevents later steps from starting.
8. If policy requires a remaining step's own approval, unattended chaining is rejected.
   Download its exact snapshot, submit it through the existing direct workflow
   or script with the required approval/confirmation, then link the successful
   job using **Link Next Approved Direct Job**. The action, YAML and health-check
   timing must match. One job cannot satisfy multiple steps. Do not disable
   approval policy to make a pipeline run.
9. Independently read back the requested settings and current cluster health.
   Record final evidence and accept the run for backup-platform restore handoff.
   Retain job evidence until acceptance. Acceptance does not restore VMs, prove
   application availability or declare the environment free of compromise.

Existing deployed runs waiting at the old health gate can use the bootstrap
control when their immutable pipeline starts with eligible settings and no
configuration steps have started. Do not recreate or replay Foundation imaging.
Partially completed or uncertain password changes require reconciliation through
the existing direct workflow. New statuses and health evidence fields are additive
JSON records; no SQL migration is required. Existing reviewed setup documents
describe planning; this section describes the updated source execution sequence.

Recovery UI transport errors now retain the HTTP status when a server/proxy
returns HTML instead of JSON. This message does not imply an imaging failure and
never resubmits the deployment. Inspect Jobs/Queue and server logs for the cause.

## Interruptions and reconciliation

- **Stop Orchestration** requests job cancellation and stops subsequent steps.
  Foundation or an in-flight write may continue. It is not a confirmed Foundation
  abort. Inspect the Foundation session and actual target state separately.
- A server restart never replays imaging/configuration. Incomplete orchestration
  is marked for reconciliation; interrupted jobs follow the normal Jobs policy.
- Close a run only after active jobs have ended, the Foundation session has ended
  and actual target state has been reconciled. Evidence notes are mandatory.
- A successfully deployed cluster can resume remaining configuration only after
  explicit reconciliation and fresh health evidence. An uncertain pending password
  change cannot be automatically replayed; use the existing direct workflow to
  reconcile credentials first. Completed steps remain recorded. If password change
  succeeded but EULA/Pulse failed, explicit reconciliation can return the run to
  bootstrap for only the unfinished EULA/Pulse steps, with fresh approvals where
  required; the successful password change is not repeated.
- Endpoint/node ownership remains reserved through configuration and acceptance,
  including uncertainty. Complete or reconcile the run before another rebuild.
  Datacenter/profile edits are blocked while their recovery run is active.
- Accepted rehearsal history records the baseline revision and timestamps. It is
  not a current readiness certificate, and dependencies can change afterward.

## Persistence, access and scope

The additive `/api/recovery` API uses the existing authentication, rate limiting
and generic JSON storage. Datacenters, revisions, run snapshots and evidence are
stored in `recovery.json` for file storage or the existing PostgreSQL document
store. No SQL migration is introduced. Include these records, job payloads,
configuration files and the credential store in the established backup plan.
Unreadable recovery storage fails closed rather than silently discarding locks.
Do not remove records or job evidence to clear an execution gate.

Administrators create/review/run recovery actions. Operators and viewers can
inspect records. The static demo is explicitly read-only and uses simulated
data; recovery writes never fall back to a live API.

The coordinator supports the current **single application process** deployment.
Its submission/ownership lock is not a distributed lock; multiple replicas or
external Foundation clients can bypass that serialization. Coordinate those
clients operationally. Separate Foundation VMs and disjoint nodes can have
separate runs, subject to job-worker capacity. This initial section supports
classic Foundation VM and one cluster per profile, not Foundation Central/FCA
recovery execution, cross-site dependency scheduling, automatic RTO measurement,
automatic credential recovery, backup restoration or forensic remediation.

## Implementation validation

Before production recovery use, rehearse a complete authorized rebuild and
post-configuration run on representative disposable hardware, including a
deliberate failure, session expiry, service restart, reconciliation and restore
handoff. Compare actual PE readbacks with the saved baseline. Isolated software
tests and browser smoke checks are separate from that physical exercise.

Related: [Infrastructure Recovery Guide](infrastructure-recovery.md),
[Recovery Rehearsal Checklist](recovery-rehearsal-checklist.md),
[Start Here](start-here.md), [Administrator Guide](admin-guide.md).
