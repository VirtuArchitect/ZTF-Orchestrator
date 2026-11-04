# Unregister PE from PC

This source feature adds an administrator-only wizard under **Workflows >
Unregister PE from PC**, also linked from the matching **Scripts** action.
It is not automatically included in previously published appliance images.
It has mocked automated coverage; target-version compatibility and live operation
must be validated separately before operational use.

## Generate and review

Enter the PC HTTPS endpoint (port 9440), a PC credential reference from the
selected global vault, and the exact PE cluster UUID. Generating or downloading
the YAML does not contact a target. The current resolver uses the selected local/Cyberark credential entries; other vault providers fail closed. No passwords belong in this file:

```yaml
pc_endpoint: https://pc.example.com:9440
pc_credential: pc_admin_ref
pe_cluster_uuid: 00000000-0000-4000-8000-000000000002
```

**Look up target (read-only)** authenticates to PC with strict certificate
verification, discovers the PC UUID and reads the named PE from PC inventory.
It captures `expected_pc_uuid` and `expected_pe_name` into the YAML. Missing,
ambiguous or mismatched identities block removal. There is no TLS bypass.

Review Nutanix's version-specific unregistration procedure and all dependencies,
including DR/replication, Flow/networking, application management and self-service
configuration. The lookup does not certify those dependencies. The operator must
explicitly set `dependencies_reviewed: true` before requesting approval.

## Approve and execute once

Request removal approval for the complete reviewed YAML. A different Orchestrator
administrator must approve it in **Approvals**. Approval is mandatory even when
the configurable workflow-approval list is empty. It binds the exact nonempty
YAML and filename, expires under the existing approval policy, and can be used
for only one job. Changing any field or acknowledgement clears the wizard's
approval. Type `UNREGISTER <PE UUID>` and submit once.

Follow the durable job in **Jobs / Queue**. The worker rechecks approval and
identities, requires the vendor API dry-run task to succeed, then submits one
unregister request. A failed or uncertain write is never automatically retried.
Cancellation may leave target-side work running; inspect and reconcile before
requesting another approval. Scheduling, script composition and pipelines are
not supported for this action.

## Verification and compatibility boundary

The adapter uses the documented Prism/Cluster Management **v4.2** contracts:

- `GET /api/prism/v4.2/config/domain-managers`
- `GET /api/clustermgmt/v4.2/config/clusters/{PE UUID}`
- `POST /api/prism/v4.2/management/domain-managers/{PC UUID}/$actions/unregister`
  with `ClusterReference.extId`, first with `$dryrun=true`
- `GET /api/prism/v4.2/config/tasks/{task ID}`

The installed PC must expose those APIs and the account must have the relevant
permissions. Unsupported APIs, unknown responses, unsuccessful tasks, TLS or
authentication errors fail closed. There is no legacy API, ncli, SSH or force
cleanup fallback, and this does not introduce an SDK runtime dependency.

Success requires a completed successful PC task and a fresh read showing the PE
absent from the same PC's inventory. Diagnostics explicitly report
`pcInventoryRemovalVerified: true`, `peSideCleanupVerified: false` and
`followupRequired: true`. This does **not** prove PE-side cleanup, dependent-service
health, safe re-registration elsewhere, workload acceptance or data protection.
Complete the applicable vendor follow-up separately; the wizard does not delete
VMs or invoke cluster destruction/cleanup commands.

The `/api/execute` and `/api/jobs` endpoints accept the workflow
`unregister-pe-from-pc` or standalone script alias `UnregisterPeFromPc`; both use
the same dedicated guards. `dryRun: true` checks intent and credential-reference
resolution locally with no target requests. It is distinct from execution's
vendor preflight and does not establish target readiness.

References: [Nutanix Prism v4.2 API documentation](https://developers.nutanix.com/api/v1/sdk/namespaces/main/prism/versions/v4.2/languages/python/ntnx_prism_py_client.api.domain_manager_api.html),
[Nutanix unregistration considerations (version-specific guide)](https://www.nutanix.com/content/dam/nutanix/documents/certifications/prism-element-web-console-guide.pdf).
