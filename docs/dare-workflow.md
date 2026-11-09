# Enable Data-at-Rest Encryption (DARE)

Open **Configure → Enable Data-at-Rest Encryption (DARE)** as an administrator. The wizard covers cluster-wide software encryption on a Prism Central-managed AHV cluster using Native KMS (Local). Software encryption cannot be disabled after enablement. Use the release-specific Nutanix guidance to confirm support, licensing and key recovery for your hardware and versions.

## Plan and verify

1. **Select cluster.** Enter the expected cluster UUID, the PE and PC HTTPS endpoints and their credential references. A managed cluster can prefill the PE fields. Both endpoints require trusted TLS. Discovery checks that PC and PE agree on identity and AHV host membership, PE reports Good health, and the encryption API returns a supported state.
2. **Choose key manager.** The wizard uses Native KMS (Local). It requires at least three healthy hosts and complete inventory. External KMS, self-encrypting drives and existing encryption migrations have separate procedures.
3. **Run read-only preflight.** Verify licensing and Native KMS prerequisites independently. Read the current settings in Prism and check for in-flight encryption tasks. Record the key backup and recovery plan and its owner. Enter a change-ticket or runbook ID. Keep passwords, passphrases and key material in the approved secure store.
4. **Review & approve.** Check the cluster UUID, host serials, encryption configuration and SHA-256. A different administrator must approve the exact plan in **Approvals**. If Prism already reports the requested configuration, the wizard shows that state without submitting another change. Unsupported API responses, ambiguous state and missing revision tokens block execution.
5. **Enable & verify.** The requester types the displayed confirmation. The worker rechecks approval, identity, health, host membership and the encryption revision before submitting a single conditional update through Prism Central. Track the task in **Jobs / Queue**. The worker verifies the accepted configuration after Prism reports task success.

## Live enablement and follow-up

Live changes default to off. Validate the installed PC and AOS versions on an approved lab cluster before setting `ZTF_DARE_ENABLE_MUTATION=true` in the Orchestrator application container's environment. For Docker Compose, use a site-managed override for that container and confirm it is included in the effective Compose configuration. The feature flag permits a submission only after the normal administrator, approval and verification checks.

Verify background encryption and complete the secure key backup using the Prism procedure. A successful job verifies the configured encryption mode. The API readback used here does not report background completion or prove that the keys are recoverable. If the task or readback is interrupted, reconcile in Prism Tasks and check the encryption state before initiating a new request. The wizard performs no automatic retry or rollback of enablement.

- [Nutanix AOS Security Guide](https://portal.nutanix.com/page/documents/details?targetId=Nutanix-Security-Guide%3Aportal-full-page-view-html)
- [Nutanix Cluster Management v4.3 encryption API](https://developers.nutanix.com/api/v1/sdk/namespaces/main/clustermgmt/versions/v4.3/languages/python/ntnx_clustermgmt_py_client.api.encryption_api.html)
