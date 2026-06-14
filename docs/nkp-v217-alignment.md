# NKP v2.17 Alignment Matrix

This document records how the ZTF-Orchestrator NKP integration and the
`VirtuArchitect/nkp-zerotouch-framework` project align with the Nutanix
Kubernetes Platform v2.17 guide.

It is intentionally written as a validation aid, not a marketing statement.
The current integration is a safe, plan-first orchestration layer. It helps
operators collect deployment inputs, generate NKP-style configuration, validate
profiles, gate execution with approvals, and submit controlled framework phases.
It does not prove a successful NKP deployment until tested with a real NKP
v2.17 bundle, Prism Central, AHV infrastructure, registry, and approved lab
targets.

## Current Assessment

| Area | Alignment | Notes |
|---|---|---|
| NKP deployment model | Supported | The integration follows the guide's overall model: prepare a host, provide NKP binaries, define Nutanix/AHV inputs, generate deployment configuration, and run controlled deployment phases. |
| Environment types | Supported | Connected, proxied, and air-gapped deployment profiles are represented in the NKP framework schema and ZTF-Orchestrator profile builder. |
| Nutanix AHV target | Supported | Prism Central endpoint, AHV cluster name, subnet, image, storage container, endpoint IP, replica counts, and related cluster settings are represented. |
| NKP CLI usage | Partially supported | The framework generates NKP CLI commands, including Nutanix cluster creation flows. Exact command and flag compatibility must be confirmed against the installed NKP v2.17 binary. |
| Safe execution model | Supported | ZTF-Orchestrator submits NKP phases through Jobs / Queue with approval gating for controlled phases. Apply/destructive behavior is intentionally constrained. |
| Profile generation | Supported | Operators can build deployment profiles in the UI and render NKP example-style YAML into Config Files. |
| Profile versioning | Supported | Saved NKP profiles keep revision history and job traceability to profile ID, revision, template, generated config, approval, and task IDs when observable. |
| NKP binary handling | Supported | Operators can register staged NKP binaries or upload smaller bundles, track version/source/checksum/default status, and link binaries to profiles. |
| Air-gapped registry handling | Partially supported | Registry endpoint, namespace, CA/insecure settings, and bundle push planning are represented. The exact NKP v2.17 registry push command should be validated with the installed CLI. |
| Proxy handling | Partially supported | Proxied environments are represented. Proxy and no-proxy flag generation should be validated against the final NKP v2.17 CLI syntax and target network model. |
| Nutanix Image Builder | Planned | The NKP guide includes image creation workflows such as `nkp create image nutanix`. The current integration assumes a prepared VM image rather than fully orchestrating image creation. |
| Pre-provisioned deployments | Planned | The guide includes pre-provisioned inventory workflows. The current implementation is primarily AHV/Nutanix cluster generation and does not yet provide a complete pre-provisioned inventory builder. |
| Kommander installation and customization | Partial | The framework can participate in broader NKP phases, but full Kommander install customization, app configuration, certificates, domains, and day-2 operations are not yet fully modeled in the UI. |
| Backup and restore | Partial | ZTF-Orchestrator supports PostgreSQL application-state backup. NKP platform backup and restore must still follow Nutanix/NKP guidance and requires infrastructure validation. |
| Upgrades | Planned | Upgrade planning can be represented, but full NKP upgrade execution and rollback validation are not yet implemented as a complete guided workflow. |
| Destructive operations | Intentionally constrained | Destroy/apply style operations should remain gated and explicit. The current integration favors dry-run, generation, planning, and approval-based execution. |
| Production validation | Not yet complete | Real deployment validation requires an NKP v2.17 bundle, Prism Central, AHV test cluster, registry, network services, and operator-approved test targets. |

## What Matches Well

- ZTF-Orchestrator captures the operational inputs that the NKP guide expects
  for a Nutanix AHV deployment.
- The NKP framework preserves the correct control plane: NKP CLI remains the
  deployment engine, while ZTF-Orchestrator provides UI, validation, approvals,
  traceability, and job control.
- The integration is intentionally safe for early adoption because it starts
  with profile creation, YAML generation, readiness checks, approvals, and
  observable job output rather than uncontrolled direct infrastructure changes.

## Known Gaps To Close

1. Capture real NKP v2.17 CLI help output for the installed binary:
   - `nkp create cluster nutanix --help`
   - `nkp create image nutanix --help`
   - `nkp push bundle --help`
   - `nkp push image-bundle --help`

2. Confirm exact command syntax used by `VirtuArchitect/nkp-zerotouch-framework`
   for:
   - cluster image flags;
   - registry bundle push;
   - proxy and no-proxy behavior;
   - air-gapped bundle references;
   - self-managed cluster movement and kubeconfig generation.

3. Add guided UI support for Nutanix Image Builder inputs:
   - Prism Central endpoint and credential reference;
   - Prism Element cluster;
   - subnet;
   - source/base image;
   - artifact bundle;
   - optional FIPS, insecure TLS, bastion, GPU/vGPU, and air-gapped image
     bundle fields.

4. Add a pre-provisioned deployment profile type:
   - control-plane and worker inventory;
   - SSH key reference;
   - external load balancer or virtual IP settings;
   - production control-plane sizing guidance;
   - generated inventory YAML preview.

5. Extend Kommander/day-2 modeling:
   - domain and certificate settings;
   - default StorageClass and load balancer checks;
   - GitHub or local registry access checks;
   - install, verify, backup, restore, upgrade, and rollback planning.

6. Run infrastructure UAT:
   - connected AHV deployment dry run;
   - air-gapped registry preparation;
   - real Prism Central authentication;
   - generated YAML validation against the NKP CLI;
   - one safe lab deployment;
   - teardown or recovery validation in an approved test environment.

## Recommended Validation Evidence

The following evidence should be stored under `docs/validation/` once available:

| Evidence | Purpose |
|---|---|
| NKP CLI help captures | Proves generated commands match the installed NKP version. |
| Example generated YAML | Shows profile builder output aligned with NKP framework examples. |
| Dry-run output | Shows NKP accepts generated inputs without applying changes. |
| Prism Central connectivity proof | Confirms endpoint, account, certificate, and network assumptions. |
| Registry push proof | Confirms standard and air-gapped bundle handling. |
| Lab deployment result | Confirms end-to-end deployment behavior in a safe target environment. |

## Truthful Positioning

ZTF-Orchestrator plus the NKP framework is aligned with the NKP v2.17 deployment
approach and is suitable for controlled lab validation. It should not yet be
described as a fully validated NKP deployment appliance until the remaining CLI,
registry, Nutanix Image Builder, pre-provisioned, Kommander, and infrastructure
UAT items are completed.
