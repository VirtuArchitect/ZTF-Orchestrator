# Recovery Rehearsal Checklist

Current release marker: `v1.8.4`.

Use with the [Infrastructure Recovery Guide](infrastructure-recovery.md).
This is a template for an authorized rehearsal, not evidence that recovery has
already been validated. Do not run destructive steps on unapproved targets.

## Rehearsal Record

| Field | Record before the drill |
|---|---|
| Scenario and incident/change reference | Cluster loss or post-containment rebuild scenario |
| Scope and environment | Exact approved nodes, network, and execution path |
| Owners | Incident, security, infrastructure, backup, and application owners |
| Versions and baseline | Orchestrator, ZTF/adapter, Foundation, AOS/AHV, reviewed configuration hashes |
| Objectives | RTO, RPO, stage budgets, and application acceptance criteria |
| Evidence destination | Protected storage outside the affected cluster and application |
| Stop and escalation criteria | Unexpected target, trust failure, unsafe execution, or exceeded stage budget |

## Prerequisites

- [ ] Approve destructive scope and preserve required incident evidence.
- [ ] Confirm containment and security authorization for the scenario.
- [ ] Confirm the trusted Orchestrator, Foundation service, and recovery network
      remain available without the affected cluster.
- [ ] Review target identities, hardware/version compatibility, image provenance,
      integrity references, configuration, and fresh credentials.
- [ ] Verify DNS, NTP, BMC access, network isolation, image access, backup access,
      capacity, licensing, and required identity/certificate dependencies.
- [ ] Identify validated backup recovery points and workload restore owners.
- [ ] Freeze unrelated automation and reconcile active target-side tasks.
- [ ] Run available non-mutating preflight checks and resolve blockers.
- [ ] Assign each manual or blocked baseline control an owner and completion gate.

## Execute and Accept

- [ ] Capture approved inputs, approvals, start times, and workflow selection.
- [ ] Execute the selected validated rebuild path on approved targets.
- [ ] Verify target-side imaging results, cluster formation, inventory, and versions.
- [ ] Apply supported baseline operations and record manual control completion.
- [ ] Verify health, DNS/NTP, networks, storage, access, and required integrations.
- [ ] Obtain infrastructure and security acceptance before restoring workloads.
- [ ] Restore a representative application using the existing backup platform;
      verify data integrity, access, and business-service acceptance.
- [ ] Obtain explicit authorization before reconnecting to production networks.
- [ ] Export redacted evidence and record exceptions, residual risks, and owners.

## Failure Exercises

Use approved fault simulation where practical; do not introduce real compromise.

- [ ] Failed imaging or partial node completion: reconcile actual target state
      and document the approved resume/retry decision.
- [ ] Unavailable management dependency: verify the independent recovery path
      or record the blocker and its recovery owner.
- [ ] Cancellation with a continuing target task: verify task tracking and
      escalation before any retry.
- [ ] Untrusted image/configuration or incorrect target: confirm the process
      stops before destructive execution.

## Results and Follow-up

| Measurement | Actual result and evidence reference |
|---|---|
| Containment to recovery authorization | Fill after drill |
| Infrastructure imaging and cluster creation | Fill after drill |
| Baseline completion and platform acceptance | Fill after drill |
| Workload restoration and service acceptance | Fill after drill |
| Total recovery time versus RTO | Include waits, failures, and manual work |
| Restored data recovery point versus RPO | Validate with backup/application owner |
| Failures, exceptions, and corrective actions | Assign owner and due date |

- [ ] Record pass/fail against predefined criteria and exact validated scope.
- [ ] Review findings with all recovery owners and update the approved baseline.
- [ ] Schedule the next rehearsal through the organization's normal process.
- [ ] Publish timing or recovery claims only with supporting evidence and scope.
