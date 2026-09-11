# Dell XC770 AHV HCI Deployment Requirements

Current release marker: `v1.8.1`.

This document defines the requirements and guarded execution contract for using
Native Foundation Deploy as a Dell XC770 Core AHV HCI deployment path.

## Current Boundary

Native Foundation Deploy validates intent, creates deployment plans, reviews
evidence gates, performs gated read-only Dell iDRAC Redfish service-root probes,
checks AOS and AHV image source reachability/checksum declarations, invokes a
locally configured real Foundation deployment adapter command, captures adapter
stdout/stderr and evidence files, and performs a non-mutating Prism Element
post-create validation.

The built-in Dell probe remains a read-only `GET` to `/redfish/v1/`. Mutating
AHV mounting, AOS deployment, and HCI cluster formation are delegated to the
operator-supplied adapter command configured on the appliance. The orchestrator
does not claim deployment success unless that command exits successfully and the
Prism Element validation passes.

## Deployment-Capable Definition

The workflow is deployment-capable for Dell XC770 AHV HCI only when one guarded
execution path can complete all of the following against a bounded four-node
UAT cluster:

- Resolve Dell iDRAC credentials through the approved secret reference path.
- Validate Redfish service-root reachability for every declared node.
- Validate Dell model, serial, power state, boot mode, and virtual media
  readiness for every declared node.
- Validate AOS and AHV image sources, versions, SHA256 checksums, and access
  from the appliance execution environment.
- Mount or stage AHV installation media through the approved iDRAC or
  Foundation-controlled mechanism.
- Boot each node into the expected installer or Foundation imaging state.
- Drive the Foundation 5.11-compatible deployment operation for AHV and AOS.
- Monitor node imaging, CVM creation, and Foundation task progress until a
  terminal success or failure state.
- Form the Nutanix AHV HCI cluster using the declared cluster name, cluster
  VIP, CVM IPs, host IPs, DNS, NTP, gateway, and topology metadata.
- Validate the completed cluster in Prism Element with a non-mutating live
  read after creation.
- Persist deployment logs, Foundation task output, per-node evidence, final
  cluster validation evidence, and checksums.
- Fail closed when the workflow attempts an unsupported provider, unsupported
  cluster type, missing credential, missing image artifact, failed Redfish
  check, failed Foundation task, failed Prism Element validation, or
  unapproved mutating run.

## Required Adapter Interfaces

The implementation uses a guarded adapter command contract instead of embedding
unverified vendor-specific Foundation 5.11 API assumptions in the orchestrator.

| Adapter | Required behavior |
|---|---|
| Dell iDRAC Redfish discovery adapter | Probe every declared iDRAC, authenticate, read model/serial/power/boot/virtual-media facts, redact raw payloads, and return normalized evidence. |
| Dell iDRAC Redfish mutation adapter | Perform only explicitly admitted boot, power, virtual media, and reset operations for scoped UAT nodes. |
| Foundation 5.11 execution adapter | A reviewed local executable referenced by `ZTF_NATIVE_FOUNDATION_ADAPTER_COMMAND`; it receives the intent file, adapter request file, job id, plan id, and evidence directory through environment variables, then submits or drives AHV/AOS imaging and cluster formation through the Foundation 5.11-compatible mechanism selected for the UAT. |
| Prism Element validation adapter | Built-in non-mutating `GET /PrismGateway/services/rest/v2.0/cluster/` validation against the declared endpoint or cluster VIP after deployment. |
| Evidence adapter | Built-in evidence directory creation under the ZTF data directory with the intent, adapter request, stdout, stderr, and deployment evidence manifest. The operator-supplied adapter can add Foundation logs and task evidence to the same directory. |

## Required Workflow Gates

The `Run Workflow` path must remain blocked until these gates pass:

- Native Foundation intent validates with `deployment_type: hci` and
  `hypervisor: ahv`.
- Every site uses `hardware_provider: dell_idrac_redfish`.
- Every node has `node_serial`, `hardware_model`, `bmc_address`, `host_ip`,
  `cvm_ip`, `hypervisor_hostname`, `boot_mode`, and `bmc_credential_ref`.
- `foundation_engine.compatibility_baseline` is pinned to the supported
  Foundation baseline for the adapter.
- AOS and AHV images have source, version, SHA256, and repository access
  evidence.
- iDRAC live discovery passes for all declared nodes.
- `ZTF_NATIVE_FOUNDATION_ENABLE_REAL_DEPLOYMENT_ADAPTER=true`.
- `ZTF_NATIVE_FOUNDATION_ADAPTER_COMMAND` is an absolute path to the reviewed
  local Foundation deployment adapter executable.
- Prism Element validation credentials are available as a named reference.
- Approval, UAT scope, UAT runbook, security review, operations review,
  rollback plan, maintenance window, and evidence-retention target are bound to
  the exact plan hash.
- Mutating adapter package provenance, SBOM, allow-list, runtime isolation,
  runtime admission, command invocation, output evidence, and retained-evidence
  export gates are accepted.
- The final execution path is scoped to the declared nodes and cannot discover
  or mutate additional targets.

## Failure Requirements

The deployment adapter must fail closed:

- Before mutation if any node cannot be probed through Redfish.
- Before mutation if the image checksum, version, or repository check fails.
- Before mutation if the real deployment adapter flag is not enabled or the
  adapter command is absent.
- Before mutation if the operator approval or UAT evidence does not match the
  current plan hash.
- During execution if Foundation returns a failed, cancelled, timed-out, or
  unknown terminal task state.
- During execution if any node reports an unexpected serial, model, boot state,
  CVM IP, host IP, or hypervisor identity.
- After execution if Prism Element validation cannot confirm the intended
  cluster.

Failures must preserve logs and evidence, stop additional mutation, and report
the next safe operator action.

## UAT Acceptance Criteria

For Dell XC770 AHV HCI UAT to pass, the evidence pack must include:

- Four successful Dell iDRAC Redfish discovery records.
- Four node hardware identity records matching the intended serials.
- AOS and AHV image checksum verification from the appliance.
- Foundation deployment submission record or equivalent Foundation-controlled
  execution record.
- Foundation progress records for AHV install, AOS install, CVM creation, and
  cluster formation.
- Terminal success state for the Foundation deployment.
- Prism Element validation proving the cluster name, cluster VIP, four nodes,
  AHV hypervisor, CVM addresses, and health summary.
- Redacted logs and retained artifact checksums.
- Rollback or recovery notes for any warning encountered during the run.

Until these criteria are captured from real hardware, Native Foundation Deploy
must continue to be described as controlled-UAT deployment-capable through a
configured local Foundation adapter command, not as generally certified Dell
production deployment support.
