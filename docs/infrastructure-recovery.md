# Infrastructure Recovery Preparation and Rebuild

Current release marker: `v1.8.4`.

> Backups preserve what you need to recover. Our focus is preparing and
> rehearsing how to rebuild the infrastructure you recover onto.

ZTF-Orchestrator can support the infrastructure rebuild and validation phase of
a broader disaster recovery process. The opportunity is to reduce improvisation
with reviewed configuration, rehearsed workflows, controlled execution, and
evidence for workload-recovery handover. Reduced recovery time is a hypothesis
until measured in the intended environment.

This guide describes a process assembled from existing capabilities. It is not
a dedicated DR executor, malware-remediation tool, forensic tool, or backup
restore service. Cluster reimaging does not prove that compromise has been
removed from identity services, management networks, BMCs, firmware, or workloads.

## Recovery Scope and Trust

The incident commander and security lead own containment, evidence preservation,
the rebuild decision, and permission to reconnect systems. Reimaging is destructive:
approve exact target nodes and preserve required evidence and recovery sources
before execution. Prefer an isolated recovery environment or replacement capacity
when the incident plan requires it.

Run the Orchestrator and the selected Foundation service from trusted infrastructure
that remains available when the affected cluster is offline. Review runtime and
image provenance, compatibility, and integrity using trusted references. Do not
reuse potentially compromised credentials or blindly import current configuration.
Review configurations against a separately retained, approved baseline.

Assess DNS, NTP, network access, image repositories, identity, BMC access,
backup services, certificates, and licensing as recovery dependencies. Assign
owners for credential rotation and firmware/BMC trust decisions outside the
Orchestrator's verified execution scope.

## Current Capability Boundaries

| Building block | Current role | Limit for recovery claims |
|---|---|---|
| Foundation Central and Foundation VM cluster creation/imaging | Infrastructure deployment execution paths | Validate the exact hardware, images, runtime, API, and workflow in the recovery environment; catalog presence is not live recovery proof |
| Standalone FCA | Guarded Lifecycle intent and execution paths | Prove endpoint/version compatibility and target execution separately |
| Native Foundation | Planning and evidence, with an explicitly enabled Dell iDRAC controlled-UAT adapter path | Most phases are review-only; no broad hardware or production support claim |
| Configure Cluster and Post-Foundation Baseline | Supported mapped configuration and validation steps | Review the generated operations and their apply/evidence/manual/blocked modes |
| PE Network Baseline | Mapped VM network creation | Virtual switch descriptions, uplink intent, and LACP remain blocked pending verified mappings |
| PE Monitoring Baseline | NCC validation evidence | SMTP, alert contacts, SNMPv3, and syslog configuration remain blocked |
| AHV Security Hardening | Checklist and verified mappings where available | Manual and blocked controls require separate completion and evidence |
| PE Certificate Baseline | Certificate validation evidence | CSR generation and certificate import remain blocked |
| Hardware OOB Baseline | Inventory validation evidence | BMC credential rotation and BIOS/Secure Boot changes remain blocked |
| Jobs, approvals, audit, drift, and validation evidence | Execution oversight and recovery handover records | Job success and health checks are not security clearance; use target-side verification and external evidence retention |

Legacy workflow execution uses ZTF 1.x. The separate ZTF 2.x plan/apply lane
is not a substitute for legacy Foundation imaging workflows. Select and rehearse
one supported execution path rather than treating the lanes as interchangeable.

## Recovery Sequence and Acceptance Gates

| Phase | Action and owner | Gate before proceeding |
|---|---|---|
| Prepare | Platform team retains reviewed inputs, artifacts, dependencies, and this rehearsal record outside the affected cluster | Exact workflow and target combination has representative validation |
| Contain | Incident team isolates affected systems and preserves evidence; platform team freezes jobs, schedules, and triggers | Security lead approves recovery scope; outstanding target tasks are reconciled |
| Authorize | Recovery lead approves node identities, destructive impact, reviewed baseline, and backup/application restore ownership | Record approval in the incident/change process and use applicable workflow approval gates; do not assume every catalog path enforces the same binding |
| Rebuild | Infrastructure team runs the validated imaging and cluster-creation path | Verify target-side task results, expected node inventory, approved versions, and cluster formation |
| Configure | Platform team applies supported baselines and completes manual controls | Record actual configuration, fresh credentials, and completed or explicitly accepted residual controls |
| Validate | Infrastructure and security teams check health, dependencies, access, segmentation, and incident-specific security criteria | Both owners accept the recovery platform; a successful job alone is insufficient |
| Restore and hand over | Backup/application team validates selected recovery sources and restores representative workloads | Application owner confirms integrity and service acceptance; incident authority approves reconnection |

Use [RB-004 Workflow Execution](runbooks/RB-004-ztf-workflow-execution.md),
[RB-005 Failed Job Recovery](runbooks/RB-005-failed-job-recovery.md), and
[RB-006 Emergency Stop](runbooks/RB-006-emergency-stop.md). Cancellation or stopping
the Orchestrator may leave a Foundation or Prism task running independently.
Check target-side state before retrying; do not assume rollback or repeat safety.

## Evidence and Validation Boundary

Retain approved input hashes, artifact versions and trusted integrity references,
target identifiers, approvals, job logs, target task results, manual control
records, acceptance decisions, and timings outside the affected application.
Redact secrets from exported evidence. Assign access and retention owners.

Record containment-to-authorization, infrastructure rebuild, baseline/validation,
workload restore, and service acceptance times separately. Compare total elapsed
time with the agreed RTO; assess workload data loss against the backup recovery
point and RPO. Infrastructure recreation alone does not meet a workload RPO.

Start with the [Recovery Rehearsal Checklist](recovery-rehearsal-checklist.md).
Local tests, simulation, and controlled UAT support only their demonstrated scope.
See the [Production Readiness Boundary](production-readiness-boundary.md).
For incident-response context, see [CISA's StopRansomware Guide](https://www.cisa.gov/stopransomware/ransomware-guide).

Recovery of the Orchestrator application and database is a separate procedure:
[Disaster Recovery of ZTF-Orchestrator](governance/DISASTER-RECOVERY.md).
