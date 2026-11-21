# AHV Uplink Migration

Open **Configure → AHV Uplink Migration** as an administrator. The wizard changes physical uplink membership on one cluster of 3–16 healthy AHV hosts. Workload subnet moves and CVM backplane segmentation have separate procedures.

## PE direct: no Prism Central required

1. Choose **PE direct — no Prism Central** (the default for a new draft). Select a managed cluster or enter its expected UUID, PE HTTPS endpoint on port 9440 and saved PE credential reference.
2. Enter a saved **CVM credential reference** for the `nutanix` account and a JSON mapping of every CVM IPv4 address to its independently verified `SHA256:` SSH host-key fingerprint. No password is entered in the wizard. Verify fingerprints through an independently trusted console; do not treat an unverified key scan as proof of identity. CVM-to-local-AHV SSH trust must already work with strict host-key checking.
3. New PE-direct drafts leave **Verify PE TLS certificate** unchecked and prefill an editable deployment/recovery reason, so self-signed or untrusted PE certificates do not block discovery. Enable the optional checkbox for trusted HTTPS. Review the reason before discovery; do not include passwords. HTTPS is still encrypted, but PE server identity is not authenticated. The setting and reason are part of the hashed plan, independent approval, audit events and job diagnostics. The exception affects this operation only, never global TLS or SSH trust. Saved drafts keep their explicit TLS setting; changing it invalidates discovery, preflight and approval rather than modifying an approved plan. Returning from Prism Central mode to PE direct starts with the deployment/recovery exception.
4. Run **Discover cluster (read-only)**. PE UUID, AHV membership and Good health must verify. Pinned CVM SSH reads the local AHV serial, management address and structured OVS inventory; it performs no network changes.
5. Select **Create a new virtual switch** or a consistently existing destination. In PE-direct mode, `vs1` means the local OVS bridge `br1`; this path does not create a Prism Central distributed-switch object. Destinations are `vs1`/`br1` through `vs999`/`br999`, active-backup, MTU 1500 or 9000.
6. For every host, choose the physical NICs that stay on `br0` and those that move. Keep at least two operational uplinks on `br0` and at least two at the destination. Independently check cabling, VLANs, MTU, capacity and out-of-band access. Run read-only preflight, review the exact keep/move assignments and transport exception, then request approval from a different administrator.
7. When live application has been explicitly enabled in a validated environment, type the exact confirmation. Each host is processed sequentially using fixed `manage_ovs` commands: retain the approved `br0` bond, verify management connectivity and retained membership, create the destination bridge when needed, attach its uplinks, then verify both assignments and PE identity/health. A final all-host readback checks for drift. Requester and approver must remain administrators.

A failed or uncertain SSH action stops processing. Completed hosts remain recorded in **Jobs / Queue**; no later host is changed and no write is automatically retried or rolled back. Independently reconcile the actual bridges and Foundation/PE state before requesting a new plan. Cancellation cannot undo an accepted remote operation. Preserve the original assignments and access the host console if management connectivity is lost.

## Existing Prism Central path

Select **Prism Central managed** to retain the existing trusted PC/PE v4.2 flow. It requires separate saved PC and PE credential references, agreeing identities, revision tokens and standard Prism task verification. Existing saved plans remain on their original transport; no automatic conversion occurs.

## Validation and enablement

Packaged Docker/appliance deployments set `ZTF_AHV_UPLINK_MIGRATION_ENABLED=true`; explicit false overrides retain planning mode. Validate the selected transport and complete rolling operation on representative AOS/AHV hardware before production use. PE-direct mode reuses the installed ZTF SSH interpreter and Paramiko; no runtime dependency is added. Missing runtime support, unverified host keys, unsupported inventory, partial destination bridges and unhealthy hosts block execution. Mocked tests do not establish hardware compatibility or end-to-end VLAN/workload connectivity. VS0 MTU and recovery health collection keep their existing transport rules.

- [Nutanix PE v2 API reference](https://www.nutanix.dev/api_reference/apis/prism_v2.html)
- [Nutanix cluster-local networking guidance](https://portal.nutanix.com/page/documents/details?targetId=Nutanix-Security-Guide%3Aportal-full-page-view-html)
- [Nutanix Networking v4.2 virtual switch API](https://developers.nutanix.com/api/v1/sdk/namespaces/main/networking/versions/v4.2/languages/python/ntnx_networking_py_client.api.virtual_switches_api.html)

See [workflow execution settings](workflow-execution-settings.md) for defaults and operator overrides.
