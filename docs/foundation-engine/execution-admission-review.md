# Native Foundation Execution Admission Review

Current release marker: `v1.8.1`.

Execution admission review composes the native Foundation plan, execution
readiness, adapter readiness, deployment policy, approval binding, and review
packet evidence checks into one read-only gate. When the selected Validation
Evidence record contains `nativeFoundationGateSummary`, admission carries the
packet output-evidence, retained-export, and controlled UAT completion status
into the top-level response and each selected cluster decision.

This review is the future pre-start control for native Foundation execution. In
this release it cannot start deployment and always reports
`canStartExecution: false`.

## API

```text
POST /api/native-foundation/execution/admission-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "approvalId": "<approval id>",
  "evidenceId": "<validation evidence id>",
  "phase": "full_deployment",
  "siteName": "<optional site>",
  "clusterName": "<optional cluster>",
  "providerId": "<optional provider>",
  "deploymentType": "<optional deployment type>"
}
```

Valid intent returns `200` with a blocked read-only admission review. Invalid
intent returns `400`.

## Review Inputs

The admission review checks:

- Intent plan validity.
- Requested site, cluster, provider, and deployment-type scope.
- Execution readiness gates apart from adapter enablement.
- Adapter readiness evidence apart from the disabled execution switch.
- Deployment policy apart from disabled scheduling.
- Approval binding and matching native Foundation review-packet evidence.
- Review-packet output evidence and retained-export gate summary.
- Review-packet controlled UAT completion gate metadata.
- The final execution-adapter disablement block.

## Decisions

Each selected cluster returns an admission decision with:

- Site, cluster, provider, deployment type, and cluster VIP.
- Planned execution graph step IDs.
- `packetGateSummary` from the captured review packet, when available.
- `canStartExecution: false`.
- Blocked reasons from readiness, adapter, policy, approval, and execution
  adapter state.

## Boundary

Execution admission review is non-mutating. It does not schedule work, start
imaging, create clusters, contact hardware providers, contact Prism Element,
resolve secrets, or collect live evidence.
