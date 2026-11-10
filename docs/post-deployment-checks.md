# Post-deployment checks

Open **Start Here > Configure > Post-deployment checks** as an administrator
after the baseline pipeline has registered the cluster with Prism Central.
This source change is unreleased; it does not update an existing appliance
ZIP or enable live submissions on an appliance.

| Operation | What it does |
| --- | --- |
| **Cluster FQDN** | Reads the registered cluster's v4.2 network settings and strong ETag. Verifies that DNS resolves only to authenticated PE VIP/CVM inventory addresses and that each address serves the selected DNS name over trusted HTTPS and reports the same cluster UUID. After approval, changes only the FQDN within the reviewed network settings, waits for the Prism task and verifies the field and preserved settings again. It does not edit DNS, install a certificate or rewrite Orchestrator connection profiles. |
| **LCM inventory** | Uses Lifecycle v4.3 through PC with the managed PE UUID in `X-Cluster-Id`. Verifies the existing web-server Dark Site source, idle status and disabled module auto-upgrade, then submits one inventory task after approval. It does not change the source, upload bundles or submit a product or firmware upgrade. Inventory may perform normal LCM framework work for the installed release. Direct-upload and connected-site modes are outside this workflow. |
| **PE certificate check** | Verifies the installed certificate and authenticated PE identity at every DNS address and records the leaf SHA-256 fingerprints for comparison with the approved certificate. It does not import a certificate or accept a private key. |
| **CVM rename plan** | Checks reviewed serials against healthy AHV inventory and maps the operator's node order to CVM addresses and proposed `NTNX-<cluster>-Nxx-CVM` display names. This is a plan, not a comparison against current display names or a live rename. |
| **Acceptance checks** | Reads PE and PC identity, AHV membership and PE-reported health, checks the expected FQDN and trusted access, and reads the expected LCM source and storage container names. Even when these checks pass, the result is **Operator acceptance required**, not a workload release decision. |

Prepare DNS and install a CA-signed PE server certificate through the approved
[Prism certificate procedure](https://portal.nutanix.com/page/documents/details?targetId=Nutanix-Security-Guide%3Aportal-full-page-view-html)
before running the FQDN action. Configure [persistent CA trust](pe-certificate-trust.md)
first. This v4.2 action targets a **registered** cluster, so if the FQDN must
be set before registration, set it in PE Cluster Details through the existing
operator procedure. Keep the existing trusted endpoint until the new one is
verified. Only credential references belong in the reviewed plan.

Read-only collection does not require mutation flags. In a validated controlled
UAT deployment, set the appropriate variable in the **application container's**
effective environment:

- `ZTF_CLUSTER_FQDN_ENABLE_MUTATION=true` enables approved FQDN submissions.
- `ZTF_LCM_INVENTORY_ENABLE_SUBMISSION=true` enables approved LCM inventory submissions.

Both default to off. Review the exact plan, request approval from a different
administrator, check the approval status, enter the cluster-bound confirmation
and submit. Repeating the submission with the same approved plan returns the
same job. The worker rechecks identity, preflight state, maintenance, roles,
expiry and job binding before submitting. If a task is interrupted, fails, or
its readback cannot be verified, reconcile in Prism Tasks before any new review;
do not assume rollback or replay the request.

## Supervised handoffs

1. Replace the PE certificate separately in an approved window. Verify DNS,
   the certificate chain and a fresh authenticated read before proceeding.
   This workflow does not handle CSR signing or private keys.
2. Use [Cluster Storage Standard](cluster-storage-standard.md) for approved
   default cleanup and [AHV Uplink Migration](ahv-uplink-migration.md) for the
   existing independently approved physical change. Recheck PE/PC access and
   actual VLAN connectivity after the uplink change.
3. Use the vendor's [CVM display rename procedure](https://www.nutanix.com/content/dam/nutanix/documents/certifications/ahv-admin.pdf)
   from a different CVM, one node at a time, checking health before advancing.
   The vendor command power-cycles its target. Do not overlap it with uplink
   migration or other disruptive work.
4. Use the separate [DARE wizard](dare-workflow.md) after network acceptance if
   the design requires it. Confirm encryption completion and key backup
   separately. Retain fresh NCC and LCM results, network and storage evidence
   and the required signoff before workloads.

## Resumable sequence

Open **Post-deployment sequence** from the checks page. Create one run for a
registered cluster with reviewed host serials, expected containers, Dark Site
URL, FQDN and a selected NCC CVM. The ordered stages are:

1. Complete certificate replacement externally. Record its change/evidence
   reference and approved leaf fingerprint; ZTF verifies the live certificate
   against that fingerprint on all resolved PE addresses.
2. Verify or set the FQDN using the existing approval and job flow.
3. Complete CVM display renames externally, then record the supervised evidence.
   ZTF rechecks healthy membership and records the proposed mapping, not the
   actual display names.
4. Run any in-scope storage, AHV uplink and DARE workflows separately. Record
   their verification evidence and approved exclusions. This checkpoint does not
   submit those jobs or certify their outcome.
5. Review and submit the managed LCM inventory job.
6. Run NCC and collect fresh acceptance checks. Record final sign-off separately;
   sign-off refreshes acceptance and requires an NCC result less than 24 hours old.

The requester reopens the persisted run to continue from its current stage.
For FQDN and LCM, request an exact-plan approval, obtain a different
administrator's decision, reload the run and type the cluster-bound confirmation.
Use **Reload runs** to see job status and **Check job and advance** after a
verified job. A restart, missing job record, or unverified outcome never replays
a job or advances the cursor. Review the actual operation in Prism Tasks or on
the CVM, ensure it has settled, and record a reconciliation reference before a
fresh attempt. A fresh write attempt requires a new approval. This is for the
standard single application instance, not a distributed cluster lock; do not
overlap these stages with standalone changes to the same cluster.

Automated NCC is off unless `ZTF_POST_DEPLOYMENT_NCC_ENABLED=true` is present
in the application container. It uses the existing ZTF Python SSH runtime, a
saved `nutanix` CVM credential, and an independently verified SSH host-key pin.
The IP is taken from fresh authenticated inventory, not from a free-form input.
The runner executes only Nutanix's
[`ncc health_checks run_all`](https://www.nutanix.com/content/dam/nutanix/documents/certifications/advanced-admin-aos.pdf),
with a 30-minute diagnostic limit. Only a complete and internally consistent
all-PASS summary with a successful exit advances the run. INFO, WARN, FAIL,
skips, other non-pass findings, missing output, or an unrecognized summary
block it. The job stores counts, not raw output or credentials; inspect the CVM
for details. Cancelling the job or losing the SSH session does not prove that
NCC stopped remotely.

Contract tests use simulated responses. Validate the exact AOS/PC API shapes,
SSH policy and NCC output on approved hardware before enabling submissions.
Do not use this as an unattended certificate or CVM change mechanism.

API references: [Cluster v4.2 update](https://developers.nutanix.com/api/v1/sdk/namespaces/main/clustermgmt/versions/v4.2/languages/java/com/nutanix/clu/java/client/api/ClustersApi.html)
and [Lifecycle config, status and inventory](https://pkg.go.dev/github.com/nutanix/ntnx-api-golang-clients/lifecycle-go-client/v4/api).
