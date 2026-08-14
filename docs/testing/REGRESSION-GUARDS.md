# Regression Guards

Current release marker: `v1.7.7`.

ZTF-Orchestrator uses release-integrity tests to prevent critical operational
documentation from drifting out of the repository.

## Guarded Areas

- Version metadata in package, server, frontend, README, changelog, and DOCX.
- Current operator docs referencing the release marker.
- Runbook index, template, required runbooks, and required headings.
- Architecture, demo, governance, testing, and UAT folder baselines.
- Public README links to operator-controlled documentation.

Run:

```bash
python -m pytest tests/test_release_integrity.py -q
```
