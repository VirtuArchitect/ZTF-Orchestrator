# Create Virtual Switch

A separate administrator workflow under **Configure → Create Virtual Switch**, also linked from **Scripts** and **Workflows**. Route: `/configure/create-virtual-switch` (Scripts alias: `/scripts/create-virtual-switch`). Workflow ID: `create-virtual-switch`.

## Scope

Creates an empty cluster-local AHV OVS bridge on each discovered host through the existing pinned CVM SSH `manage_ovs` path. `vs1` maps to `br1`; names `vs1` through `vs999` are supported. No Prism Central connection is used. This is not VM network creation and does not attach, detach or migrate NICs. The bridge's actual MTU is reported; this action does not set MTU or bond configuration. This cluster-local representation requires validation on the exact AOS/AHV version before production enablement.

## Operator steps

1. Open **Configure → Create Virtual Switch** or the standalone link in Scripts/Workflows.
2. Select a managed cluster or enter its PE HTTPS endpoint, PE credential reference and independently confirmed UUID.
3. Keep the deployment/recovery PE TLS exception selected, or enable certificate verification for trusted HTTPS. Review its reason. HTTPS remains encrypted when certificate verification is bypassed; server identity is not authenticated by its certificate. The policy is audited and bound to the exact approved plan.
4. Enter the saved `nutanix` CVM credential reference and independently verified SHA-256 SSH host-key fingerprints for every CVM. The HTTPS exception never bypasses SSH trust. Existing CVM-to-AHV SSH trust is required.
5. Enter a new name such as `vs1`. Review host identity, out-of-band access and any previous job. Reconcile any uncertain earlier operation before confirming none is still in progress.
6. Use **Generate YAML** or **Download Config** to retain the draft without executing. The draft is configuration intent, not permission to create a switch or a legacy ZTF script input.
7. Run **read-only preflight**. Review every host, physical NIC assignments, existing empty bridges and the exact plan SHA-256. This phase performs reads only.
8. Request **independent approval**. Another administrator must approve the exact canonical plan. Saved approvals are not changed when inputs change; a new plan needs fresh approval.
9. After hardware validation and deployment-owner enablement, type `CREATE SWITCH <cluster-uuid> vs1` and apply. Only the requester may submit their independently approved plan. Duplicate submission returns the existing job.
10. Review per-host results in the workflow and Jobs / Queue. Each created bridge must be empty; observed br0, physical NICs, serial and management addresses must remain unchanged. Reported MTU is evidence, not a requested change.
11. To attach uplinks later, open **AHV Uplink Migration**, choose **Use an existing virtual switch**, select `vs1`, and complete that action's own preflight and approval. An empty bridge with no bond is supported; the uplink action configures its reviewed bond/MTU while verifying retained br0 uplinks.

## Failure and partial completion

No write is automatically retried or rolled back. A response loss or failed readback stops later hosts. Already verified hosts remain in durable job diagnostics. After independently reconciling the actual state, a new preflight may preserve existing empty bridges and propose creation only on missing hosts; it requires a fresh independent approval. Populated or ambiguous destination bridges are rejected. Existing approvals, recovery records, completed configuration and step 08-only retry are not modified.

## Enablement and validation

`ZTF_CREATE_VIRTUAL_SWITCH_ENABLE_MUTATION=true` is a dedicated host deployment setting. It defaults off and is independent of uplink migration enablement. Leave it off until a representative hardware trial verifies the exact cluster-local command, switch representation and workload connectivity on the selected AOS/AHV version. Local automated tests use mocked PE/CVM endpoints; no live cluster is changed. Other workflows and legacy ZTF 1.x pipelines keep their existing behavior.

The API is admin-only: `GET /api/create-virtual-switch`, and `POST` to `/preflight`, `/approval` and `/apply`. Preflight accepts `connection`, `switchName` and `reviewed`; approval accepts exact `content`; apply requires `content`, `approvalId` and the exact `confirmation`. The durable job uses `create-virtual-switch.yml` as the reviewed configuration filename. No credentials or private SSH keys are included in the plan.
