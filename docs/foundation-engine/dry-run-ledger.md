# Native Foundation Dry-Run Ledger

Current release marker: `v1.8.0`.

The dry-run ledger turns the native Foundation execution graph into a
step-level review artifact. It records the site, cluster, provider, deployment
type, adapter request, checkpoint state, dependency list, and expected evidence
outputs for each planned step. When the execution request includes captured
packet gate context, each matching ledger entry carries the output-evidence and
retained-export gate summary forward.

This capability cannot execute a dry run.

## API

```text
POST /api/native-foundation/execution/dry-run-ledger
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

Valid intent returns `200` with a blocked read-only ledger. Invalid intent
returns `400`.

## Ledger Entries

Each `ledgerEntries` item includes:

- Sequence number and deterministic entry ID.
- Execution graph step ID.
- Site and cluster name.
- Provider ID and deployment type.
- Adapter request ID.
- Packet output/export gate summary from the adapter request, when available.
- Checkpoint state.
- Dependency step IDs.
- Planned action and phase.
- Whether a mutating operation would be planned for that step.
- Expected request, redacted log, and checkpoint evidence file names.
- `ledgerState: recorded_not_executed`.
- `executionMode: dry_run_review`.
- `canExecuteStep: false`.
- `mutatingActionsEnabled: false`.

## Checks

The response checks:

- Execution request review availability.
- Execution graph availability.
- Adapter request coverage in the ledger.
- Ledger entry generation.
- Dry-run-only state.
- The final adapter execution disablement block.

## Boundary

The dry-run ledger does not run provider adapters, call Foundation, call Prism
Element, resolve secrets, power hardware, mount images, image nodes, create
clusters, validate live clusters, enqueue jobs, or persist worker state.

It exists so future adapter execution can be reviewed step by step before
controlled hardware UAT enables any scoped provider/deployment runner.
