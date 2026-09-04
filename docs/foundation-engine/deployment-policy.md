# Native Foundation Deployment Policy

Current release marker: `v1.8.1`.

Deployment policy review evaluates maintenance windows and blast-radius limits
for a `native-foundation-deploy` intent. It is a read-only scheduling gate. It
does not reserve windows, call hardware, image nodes, create clusters, or enable
native Foundation execution.

## API

```text
POST /api/native-foundation/deployment-policy
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>"
}
```

## Policy Fields

Declare global policy under `foundation_engine.policy`:

```yaml
foundation_engine:
  policy:
    max_parallel_sites: 1
    max_parallel_clusters_per_site: 1
    require_approval_binding: true
    require_validation_evidence: true
    failure_policy: stop_site
```

Supported `failure_policy` values:

- `stop_all`
- `stop_site`
- `continue_read_only`

Each site can declare a deployment window:

```yaml
sites:
  - site_name: site-a
    deployment_window:
      timezone: UTC
      days:
        - Sat
        - Sun
      start: "00:00"
      end: "06:00"
```

The policy review checks:

| Check | Purpose |
|---|---|
| `site-parallelism-within-policy` | Confirms execution graph site waves do not exceed `max_parallel_sites`. |
| `site-cluster-concurrency-within-policy` | Confirms site `concurrency_limit` values do not exceed `max_parallel_clusters_per_site`. |
| `deployment-windows-present` | Confirms every site declares a timezone, days, start, and end. |
| `approval-binding-required` | Confirms approval binding is required by policy. |
| `validation-evidence-required` | Confirms Validation Evidence is required by policy. |
| `failure-policy-valid` | Confirms the failure behavior is recognized. |
| `execution-scheduling-disabled` | Always blocked in this release. |

## Boundary

Even when every policy check passes, the response returns `status: blocked`,
`canScheduleExecution: false`, and `mutatingActionsEnabled: false`. Scheduling
can only be enabled after a specific adapter has passed controlled hardware UAT
and the support matrix, runbooks, security notes, and recovery procedures are
updated in the same change set.
