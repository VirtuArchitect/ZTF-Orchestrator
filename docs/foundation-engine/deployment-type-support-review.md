# Native Foundation Deployment Type Support Review

Current release marker: `v1.8.0`.

Deployment type support review creates fail-closed support records for each
provider/deployment-type pair in a native Foundation intent. It connects the
execution graph, cluster formation previews, post-create validation previews,
adapter readiness, promotion review, and controlled-UAT checklist so operators
can see what is still required before HCI, compute-only, storage-only, or mixed
topologies can move from planning to mutating support.

This capability does not enable support, promote adapters, run validation,
contact Prism Element, call Foundation, contact hardware providers, register
compute nodes, form storage clusters, or mutate infrastructure.

## API

```text
POST /api/native-foundation/deployment-types/support-review
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>",
  "providerId": "<optional provider scope>",
  "deploymentType": "<optional deployment type scope>",
  "approvalId": "<optional approval id>",
  "evidenceId": "<optional validation evidence id>"
}
```

Valid intent returns `200` with a blocked read-only support review. Invalid
intent returns `400`.

## Review Output

The review returns:

- `supportRecords`: one deterministic record per provider/deployment-type pair.
- `clusters`: matching clusters with formation status, post-create validation
  status, topology actions, graph step IDs, and validation step IDs.
- `missingUatEvidence`: controlled-UAT evidence aliases still required by
  adapter readiness.
- `requiredUatCaseIds`: scoped UAT checklist cases for the provider/topology.
- `checks`: graph, support-record, contract, formation, validation, UAT
  checklist, evidence, and final support-enable disablement checks.

## Boundary

Every response returns `status: blocked`,
`canEnableDeploymentTypeSupport: false`, `canRunMutatingValidation: false`, and
`mutatingActionsEnabled: false`. A deployment type can only be marked mutating
supported in a future explicit change after controlled hardware UAT, live Prism
Element evidence, support matrix updates, runbook updates, security review, and
adapter promotion controls are validated.
