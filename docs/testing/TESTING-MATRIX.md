# Testing Matrix

Current release marker: `v1.7.2`.

| Layer | Evidence | Production claim |
|---|---|---|
| Unit/API tests | `python -m pytest` | No |
| Release integrity | `tests/test_release_integrity.py` | No |
| Frontend build | `npm run build` | No |
| Security audit | `pip-audit`, `npm audit` | No |
| Simulator smoke | Prism Central simulator | No |
| DEV_LAB | Controlled Nutanix lab | Lab-scoped |
| Controlled UAT | Approved target environment | Scenario-scoped |
| Production validation | Accepted production-like target | Scope-specific |

Testing must distinguish local proof from target-side infrastructure proof.
