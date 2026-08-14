# UAT Plan

Current release marker: `v1.7.7`.

Controlled UAT proves that a specific ZTF-Orchestrator deployment can be
operated with named users, approvals, backups, validation, evidence capture, and
recovery paths.

## Required Stages

1. Installation and first-login validation.
2. Role/RBAC validation.
3. Config/YAML generation or import.
4. Server-side validation.
5. Approval gate exercise.
6. Durable job submission in safe lab/UAT scope.
7. Failed-job recovery exercise.
8. Backup and restore drill.
9. Disaster recovery tabletop or restore exercise.
10. Evidence export and handoff review.

## Exit Criteria

- Required runbooks are reviewed.
- UAT cases have outcomes and evidence.
- Backup/restore and DR expectations are documented.
- Production-readiness gaps are recorded.
