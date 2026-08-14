# Data Flow

Current release marker: `v1.7.4`.

This document summarizes the high-level data flow for operator-controlled
deployments.

```text
Operator
  -> Browser UI
  -> Flask API
  -> Auth/RBAC and validation
  -> Storage backend
       file JSON or PostgreSQL documents/sessions/audit events
  -> Durable job queue
  -> ZTF 1.x or NKP execution adapter
  -> Nutanix targets
  -> Job logs, task IDs, audit events, validation evidence
```

## Key Data Objects

| Object | Owner | Evidence use |
|---|---|---|
| Users/sessions | ZTF-Orchestrator | Access and accountability |
| Config files/YAML | ZTF-Orchestrator | Input hash and review evidence |
| Approvals | ZTF-Orchestrator | Governance gate evidence |
| Jobs/logs | ZTF-Orchestrator | Execution trace evidence |
| Audit events | ZTF-Orchestrator | Administrative and workflow trail |
| Backups | Operator/platform | Recovery point evidence |
| Target-side tasks | Nutanix target | Infrastructure confirmation |

## Evidence Rule

An execution record is not complete until operator, approver, config/profile,
job, audit, validation, and target-side evidence can be connected.
