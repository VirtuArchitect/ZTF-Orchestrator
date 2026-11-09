# AHV Uplink Migration

Open **Configure → AHV Uplink Migration** as an administrator. This separate workflow changes physical uplink membership. Workload subnet moves and CVM backplane segmentation have their own procedures.

1. Select a managed cluster or enter the exact cluster UUID and Prism Element endpoint. Supply a trusted Prism Central endpoint and separate saved references for PC and PE. Run **Discover cluster (read-only)**.
2. Choose **Create a new virtual switch**, enter a name such as `vs1`, and review the bond mode and MTU. For an existing switch, select it from inventory. This first implementation supports one cluster of 3–16 healthy AHV hosts, active-backup switches, and destination MTU 1500 or 9000.
3. Assign each physical NIC on `vs0` to stay on `br0` or move. Keep at least two operational uplinks on `br0` and ensure the destination has at least two per host after the change. Match actual ports and confirm cabling, VLANs, MTU, maintenance capacity and out-of-band access independently.
4. Run **Read-only preflight**. PC and PE must agree on cluster and host identities. The wizard checks reported health, links, switch membership, and switch concurrency tokens. Review the before-and-after assignments and request approval from a different administrator.
5. In a validated and explicitly enabled environment, the requester types the displayed confirmation and submits the approved plan. The job checks the plan against fresh inventory, releases the selected uplinks using a standard Prism task, verifies retained links, then creates or updates the destination and checks both switches on every host. **Jobs / Queue** retains Prism task IDs and readback results.

Live writes are disabled by default. The deployment owner can pass `ZTF_AHV_UPLINK_MIGRATION_ENABLED=true` to the application container after validating the Prism Networking/Cluster Management v4.2 contract and the complete rolling operation on representative test hardware. There is no quick mode or automatic replay. If a task fails, times out, or the application loses contact after submission, check Prism Tasks and reconcile both switches using the original memberships captured in the approved plan before attempting a new change. PE-reported health and NIC readback do not prove end-to-end VLAN or workload connectivity.

- [Nutanix Networking SDK virtual switch operations](https://developers.nutanix.com/api/v1/sdk/namespaces/main/networking/versions/v4.2/languages/python/ntnx_networking_py_client.api.virtual_switches_api.html)
- [Nutanix guidance on networking for existing AHV nodes](https://portal.nutanix.com/page/documents/details?targetId=Nutanix-Security-Guide%3Aportal-full-page-view-html)
