# UAT Cases

Current release marker: `v1.8.0`.

| ID | Case | Required result | Evidence |
|---|---|---|---|
| UAT-001 | App start and login | Health and login succeed | `/health`, screenshot or note |
| UAT-002 | RBAC | Admin/operator/viewer behavior matches roles | User/role evidence |
| UAT-003 | YAML/config validation | Valid config passes, invalid config fails | Validation output |
| UAT-004 | Approval gate | Controlled workflow requires approval | Approval ID |
| UAT-005 | Durable job | Job reaches expected state | Job ID and logs |
| UAT-006 | Validation evidence | Evidence pack exports | Evidence bundle |
| UAT-007 | Backup/restore | Restore succeeds in approved target | Backup and restore record |
| UAT-008 | Failed-job recovery | Failure is triaged before rerun | Recovery decision |
| UAT-009 | Emergency stop | Automation can be stopped safely | Stop record |
| UAT-010 | Disaster recovery | Restore/rebuild path is accepted | DR result |

Outcome values: pass, pass with exception, partial, fail, or not tested.
