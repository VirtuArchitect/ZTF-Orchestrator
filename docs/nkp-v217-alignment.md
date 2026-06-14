# NKP v2.17 Alignment Matrix

This document records how the ZTF-Orchestrator NKP integration and the
`VirtuArchitect/nkp-zerotouch-framework` project align with the Nutanix
Kubernetes Platform v2.17 guide.

It is intentionally written as a validation aid, not a marketing statement.
The current integration is a safe, plan-first orchestration layer. It helps
operators collect deployment inputs, generate NKP-style configuration, validate
profiles, gate execution with approvals, and submit controlled framework phases.
It does not prove a successful NKP deployment until tested with Prism Central,
AHV infrastructure, a reachable registry, and approved lab targets.

## Local Binary Validation

On 2026-06-14, the local NKP v2.17.1 bundles staged under `C:\Share` were
checked with the NKP framework and Git Bash:

- `C:\Share\nkp-air-gapped-bundle_v2.17.1_linux_amd64\nkp-v2.17.1`
- `C:\Share\nkp-bundle_v2.17.1_linux_amd64\nkp-v2.17.1`

Observed results:

- `nkp` is a Linux x86-64 executable and responds to `nkp version --help`.
- `kubectl` is a Linux x86-64 executable and reports client version `v1.34.3`.
- The air-gapped example validates with `0 failure(s)` against the real
  bundle layout.
- The NKP CLI exposes `nkp create cluster nutanix` flags including
  `--control-plane-vm-image`, `--worker-vm-image`, `--bundle`,
  `--registry-mirror-url`, and `--registry-mirror-cacert`.
- The NKP guide and CLI use `nkp push bundle --bundle` for image-bundle
  registry loading.
- The generated air-gapped deploy script reaches NKP CLI validation. It then
  fails, as expected for the sample config, because the placeholder registry CA
  file `/etc/pki/ca-trust/source/anchors/registry-ca.crt` does not exist.

## Current Assessment

| Area | Alignment | Notes |
|---|---|---|
| NKP deployment model | Supported | The integration follows the guide's overall model: prepare a host, provide NKP binaries, define Nutanix/AHV inputs, generate deployment configuration, and run controlled deployment phases. |
| Environment types | Supported | Connected, proxied, and air-gapped deployment profiles are represented in the NKP framework schema and ZTF-Orchestrator profile builder. |
| Nutanix AHV target | Supported | Prism Central endpoint, AHV cluster name, subnet, image, storage container, endpoint IP, replica counts, and related cluster settings are represented. |
| NKP CLI usage | Supported for local syntax validation | The framework generates NKP CLI commands, including Nutanix cluster creation flows. Local v2.17.1 binary checks confirmed the key cluster creation, bundle, and registry-mirror flags. Live deployment still requires infrastructure UAT. |
| Safe execution model | Supported | ZTF-Orchestrator submits NKP phases through Jobs / Queue with approval gating for controlled phases. Apply/destructive behavior is intentionally constrained. |
| Profile generation | Supported | Operators can build deployment profiles in the UI and render NKP example-style YAML into Config Files. |
| Profile versioning | Supported | Saved NKP profiles keep revision history and job traceability to profile ID, revision, template, generated config, approval, and task IDs when observable. |
| NKP binary handling | Supported | Operators can register staged NKP binaries or upload smaller bundles, track version/source/checksum/default status, and link binaries to profiles. |
| NKP CLI compatibility | Supported | Registered binaries can be checked against version, Nutanix cluster create help, Image Builder help, and bundle push help. Results identify pass/warn/fail status and capture command output for review. |
| Air-gapped registry handling | Supported for planning and local syntax validation | Registry endpoint, namespace, CA/insecure settings, registry mirror flags, and `nkp push bundle` planning are represented. Real registry push still requires a reachable private registry and valid credentials. |
| Proxy handling | Partially supported | Proxied environments are represented with HTTP proxy, HTTPS proxy, and no-proxy inputs plus readiness warnings. Final flag behavior should still be validated against the installed NKP v2.17 CLI and target network model. |
| Nutanix Image Builder | Partially supported | Profiles can now capture Image Builder planning inputs and readiness checks. Live image creation with `nkp create image nutanix` is not yet executed by ZTF-Orchestrator. |
| Pre-provisioned deployments | Planned | The guide includes pre-provisioned inventory workflows. The current implementation is primarily AHV/Nutanix cluster generation and does not yet provide a complete pre-provisioned inventory builder. |
| Kommander installation and customization | Partial | The framework can participate in broader NKP phases, but full Kommander install customization, app configuration, certificates, domains, and day-2 operations are not yet fully modeled in the UI. |
| Backup and restore | Partial | ZTF-Orchestrator supports PostgreSQL application-state backup. NKP platform backup and restore must still follow Nutanix/NKP guidance and requires infrastructure validation. |
| Upgrades | Planned | Upgrade planning can be represented, but full NKP upgrade execution and rollback validation are not yet implemented as a complete guided workflow. |
| Destructive operations | Intentionally constrained | Destroy/apply style operations should remain gated and explicit. The current integration favors dry-run, generation, planning, and approval-based execution. |
| Production validation | Not yet complete | Real deployment validation requires Prism Central, AHV test cluster, registry, network services, service credentials, and operator-approved test targets. |

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

1. Capture and store formal validation evidence under `docs/validation/`:
   - `nkp version --help`;
   - `nkp create cluster nutanix --help`;
   - `nkp create image nutanix --help`;
   - `nkp push bundle --help`;
   - generated dry-run output from a real, non-placeholder config.

2. Validate exact behavior with real infrastructure:
   - Prism Central authentication;
   - registry mirror URL, CA, username, and password;
   - proxy and no-proxy behavior;
   - air-gapped bundle references;
   - self-managed cluster movement and kubeconfig generation.

3. Complete guided UI support for Nutanix Image Builder execution:
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
| NKP CLI help captures | Proves generated commands match the installed NKP version. Initial local checks were performed on 2026-06-14; store formal captures before release claims. |
| Example generated YAML | Shows profile builder output aligned with NKP framework examples. |
| Dry-run output | Shows NKP accepts generated inputs without applying changes. |
| Prism Central connectivity proof | Confirms endpoint, account, certificate, and network assumptions. |
| Registry push proof | Confirms standard and air-gapped `nkp push bundle` handling. |
| Lab deployment result | Confirms end-to-end deployment behavior in a safe target environment. |

## Truthful Positioning

ZTF-Orchestrator plus the NKP framework is aligned with the NKP v2.17 deployment
approach and is suitable for controlled lab validation. Local NKP v2.17.1 binary
and bundle checks have now been performed, but the solution should not yet be
described as a fully validated NKP deployment appliance until registry,
Prism Central, Nutanix Image Builder, pre-provisioned, Kommander, and
infrastructure UAT items are completed.
