# Native Foundation Execution Adapter Contract

Current release marker: `v1.8.0`.

The execution adapter contract describes the request envelope a future native
Foundation provider or topology adapter must satisfy before ZTF-Orchestrator can
own deployment execution. When execution admission has a captured review packet,
the contract carries the packet output/export and controlled UAT completion
gate summary into each adapter request envelope.

This contract is read-only. It cannot import, load, instantiate, or run an
adapter.

## API

```text
POST /api/native-foundation/execution/adapter-contract
```

Request body:

```json
{
  "content": "<native-foundation-deploy yaml>",
  "approvalId": "<optional approval id>",
  "evidenceId": "<optional validation evidence id>",
  "phase": "full_deployment"
}
```

Valid intent returns `200` with a blocked read-only adapter contract. Invalid
intent returns `400`.

## Adapter Requests

Each adapter request contains:

- Deterministic request ID.
- Site, cluster, provider, deployment type, and phase.
- Plan, intent hash, discovery hash, approval, evidence, and checkpoint
  bindings.
- Execution graph step IDs.
- Packet output-evidence, retained-export, and controlled UAT completion gate
  summary, when available.
- Secret resolution request counts without secret values.
- Required audit, checkpoint, and redacted evidence output names.
- `canLoadAdapter: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Plan hash binding.
- Execution admission review.
- Packet output/export gate binding inherited from admission.
- Controlled UAT completion gate binding inherited from admission.
- Secret resolution planning.
- Resume checkpoint binding.
- Audit and evidence contract declaration.
- The final adapter-loading disablement block.

## Boundary

The contract does not start a deployment job, load provider code, call
Foundation, call Prism Element, contact hardware, resolve secrets, or mutate
infrastructure. A future mutating adapter must pass controlled UAT and security
review before this boundary can change.
