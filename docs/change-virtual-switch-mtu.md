# Change Virtual Switch MTU

Open **Advanced Automation > Scripts > Change Virtual Switch MTU** as an administrator.
Use the standalone action after cluster registration and any planned uplink
migration. It targets the default **vs0 (br0)** on a healthy 3–16 host AHV
cluster with an active-backup bond. The apply path changes MTU 1500 to 9000
using Prism Central Networking v4.2. It preserves the existing uplinks and
bond and keeps quick mode off.

1. Enter trusted PE and PC HTTPS endpoints, saved credential references and the
   cluster UUID. Verify physical network jumbo-frame support, maintenance
   capacity and out-of-band access.
2. Run read-only preflight. Review the switch and observed MTU for every
   physical uplink. Missing or mismatched host evidence blocks application.
3. Request approval. A different administrator approves the exact plan.
   Type the cluster-bound confirmation and submit once.
4. Review the Prism task and per-host readback in Jobs / Queue. Verify
   end-to-end traffic on the intended VLANs before acceptance.

Live writes default to off. Validate the exact PC/AOS/AHV combination on
representative hardware before setting `ZTF_VS0_MTU_ENABLE_MUTATION=true`
in the application container. Keep CVM interface MTU at 1500 per Nutanix
guidance. The action checks physical NIC readback, while end-to-end traffic
verification remains an operator check.

For rollback, first reconcile the original Prism task. Enter the settled
Orchestrator change job ID in the same form. The action compares live identity
and settings with the recorded original job, then uses its original MTU as
the rollback target. Request fresh approval and type the rollback confirmation.
If Prism or host telemetry is unavailable, use the site's out-of-band recovery
procedure. The action does not automatically reverse or replay a write.
