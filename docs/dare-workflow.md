# Enable Data-at-Rest Encryption (DARE)

Open **Configure → Enable Data-at-Rest Encryption (DARE)** as an administrator. The wizard enables cluster-wide software encryption with Native KMS (Local). **Software encryption cannot be disabled after enablement.** Confirm licensing, release-specific hardware support and key recovery arrangements independently.

## PE direct: no Prism Central required

1. Choose **PE direct — no Prism Central** (the default for a new draft). Select a managed cluster or enter its expected UUID, PE HTTPS endpoint on port 9440 and saved PE credential reference. No PC endpoint or PC credential is needed.
2. New PE-direct drafts leave **Verify PE TLS certificate** unchecked with an editable deployment/recovery reason. Enable it when PE certificate trust is configured. Review the reason without passwords. Encryption of the HTTPS connection remains, but PE identity is not authenticated by its certificate. The explicit exception and reason are bound to the exact plan and independent approval, recorded in audit events and retained in job diagnostics. They do not change global TLS, other workflows or SSH trust. Existing saved reviews keep their original transport choice.
3. Run **Discover cluster (read-only)**. The adapter uses PE v2 cluster/host inventory and encryption/key-manager readbacks. UUID, complete membership of 3–16 healthy AHV hosts, Good cluster health, software-encryption readiness and a supported state must verify. PE must already report **LKM**. Existing external/PC key managers, drive encryption and ambiguous or partially configured states require a separate procedure; this wizard never converts them.
4. Confirm licensing, local key-manager prerequisites, the absence of another encryption operation, irreversibility and a key-backup/recovery owner. Enter a change ticket or runbook reference. Run read-only preflight and review the target, host serials, mode, TLS exception and plan SHA-256. Request approval from a different administrator. Passwords and key material remain in the approved secure store.
5. With live enablement explicitly permitted, type the exact `ENCRYPT <cluster UUID>` confirmation. The worker rechecks approval, administrator roles, PE identity, health, membership and encryption state immediately before submitting **one** PE v2 enable request with cluster scope. It then reads back configuration and identity. No PC or SSH connection is used for PE-direct DARE.
6. Follow the Prism key-backup procedure and monitor background encryption. Job success means that PE reports cluster-wide software encryption with LKM; it does not establish key recoverability or complete workload acceptance. Container readback is reported separately from configuration. An already-configured cluster is not enabled again.

## Existing Prism Central path

Choose **Prism Central managed** to retain the existing verified PC/PE path and saved plans. It requires trusted PC/PE HTTPS, agreeing identities/membership, supported v4.3 encryption APIs and revision tokens. It submits a conditional PC update and verifies the task and configuration. PE v2 has no equivalent revision token in this operation; PE-direct mode uses a fresh pre-submission readback instead. Coordinate exclusive ownership of the change window.

## Enablement, interruption and rollback

Live changes default to off. Validate the installed AOS/API contract and licensing on representative approved lab hardware before setting `ZTF_DARE_ENABLE_MUTATION=true` in a site-managed Compose override. The flag permits submission only after normal approval and verification; it does not enable encryption by itself.

If submission, cancellation or readback is uncertain, inspect PE encryption state and tasks before any new request. The workflow never automatically retries or rolls back encryption. Rolling back the Orchestrator container does not disable DARE. Preserve key backups outside the appliance and verify the approved recovery procedure.

- [Nutanix PE v2 API reference](https://www.nutanix.dev/api_reference/apis/prism_v2.html)
- [Nutanix AOS Security Guide](https://portal.nutanix.com/page/documents/details?targetId=Nutanix-Security-Guide%3Aportal-full-page-view-html)
- [Nutanix Cluster Management v4.3 encryption API](https://developers.nutanix.com/api/v1/sdk/namespaces/main/clustermgmt/versions/v4.3/languages/python/ntnx_clustermgmt_py_client.api.encryption_api.html)
