# Workflow execution settings

New packaged Docker/appliance builds enable reviewed application for the following workflows. Starting the container or importing/installing an update does not submit a cluster operation.

| Workflow | Environment variable |
|---|---|
| AHV Uplink Migration | `ZTF_AHV_UPLINK_MIGRATION_ENABLED` |
| Create Virtual Switch | `ZTF_CREATE_VIRTUAL_SWITCH_ENABLE_MUTATION` |
| Enable Data-at-Rest Encryption (DARE) | `ZTF_DARE_ENABLE_MUTATION` |
| Change Virtual Switch MTU (vs0/br0) | `ZTF_VS0_MTU_ENABLE_MUTATION` |

The image sets these four values to `true`. Repository Docker and appliance Compose definitions pass `${VARIABLE:-true}` so `.env` can explicitly override them. Direct source execution outside the packaged container retains its previous requirement for explicit enablement.

## Update an existing Ubuntu appliance

1. Finish/reconcile active jobs, retain the previous image and a verified database/data backup pair, and record saved pipeline/approval/recovery state.
2. Verify and import the complete consolidated offline ZIP in **Administration > Appliance Ops > Guided Appliance Update**. Check readiness and use the existing exact-version confirmation and backup/install process.
3. Check the running release and service health after restart. Open the four workflows and wait for capability loading. When application is enabled, the planning-mode restriction disappears. Required inputs can still disable later controls.
4. An existing explicit `false` value in the effective Compose environment takes precedence over image defaults. The update never rewrites that owner choice. Review all Compose files used by the running service before changing it. Where required, merge the following values into the persistent override used by the appliance:

   ```yaml
   services:
     ztf-orchestrator:
       environment:
         ZTF_AHV_UPLINK_MIGRATION_ENABLED: "true"
         ZTF_CREATE_VIRTUAL_SWITCH_ENABLE_MUTATION: "true"
         ZTF_DARE_ENABLE_MUTATION: "true"
         ZTF_VS0_MTU_ENABLE_MUTATION: "true"
   ```

5. Validate the effective Compose configuration, then recreate only the Orchestrator service using the same project/file list. Preserve PostgreSQL, data volumes, ports, trust mounts and logging. An `.env` entry alone is ineffective if a custom Compose definition does not pass it to the container. Retain persistent overrides so future restarts/updates keep the reviewed choice.
6. Verify stored pipeline order, approvals and recovery state. Use mocked fixtures for offline execution rehearsals; opening a page alone proves capability display, not hardware compatibility.

## Controls that remain required

Administrator access, read-only discovery/preflight, exact independently approved plans, applicable typed confirmations, current target identity/membership/health and per-host/task verification remain unchanged. PE TLS exceptions remain explicit and audited; PC certificate trust and SSH host-key requirements are unchanged. Existing pipelines are not edited or run automatically. Completed recovery work and the reconciliation/fresh-health-gated step 08-only retry are preserved.

Enabling a capability does not establish vendor certification or hardware validation. Validate the exact versions, management connectivity and supported API/SSH operation before production use. DARE and accepted network changes cannot be undone by rolling back the application. Uncertain operations require reconciliation before another attempt; there is no new automatic write retry.

## Disable application or roll back

Set any of the four values explicitly to `false` in the effective persistent container environment and recreate only the Orchestrator service after work is idle. Discovery/preflight and review remain available in planning mode. Retain the override for future updates. For an application regression, use the existing guided previous-image/verified-backup recovery process. Restoring application state does not revert remote cluster changes.
