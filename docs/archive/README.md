# Documentation Archive

This archive index preserves historical validation, audit, and release evidence
that should not be used as the current installation or appliance update path.

Current operator guidance lives in:

- [Installation Guide](../installation-guide.md)
- [Appliance Kit](../../appliance/README.md)
- [Appliance Update Manager](../appliance-update-manager.md)
- [Air-Gapped Update Runbook](../runbooks/RB-007-airgapped-update.md)

## Historical Evidence Retained In Place

The following documents remain in their original locations so existing links and
evidence references continue to work. Treat them as historical unless they point
back to the current operator guides above.

| Path | Status |
| --- | --- |
| [DEV_LAB Disposable Container Validation Runbook](../dev-lab-disposable-container-runbook.md) | Historical v1.5.6 lab runbook retained for traceability |
| [DEV_LAB Validation Report](../dev-lab-validation-report.md) | Historical v1.5.x lab validation evidence |
| [Console Audit 2026-06-29](../audits/console-production-2026-06-29/audit-notes.md) | Historical product/UX audit evidence |
| [Console Audit 2026-06-30](../audits/console-production-2026-06-30/audit-notes.md) | Historical product/UX audit evidence |

## Cleanup Rules

- Keep `CHANGELOG.md` as the authoritative version history.
- Keep historical validation reports when they explain why a guardrail exists.
- Do not follow archived commands for new installs or current appliance updates
  unless a maintainer explicitly revalidates them for the current release.
- Prefer `<version>` or the current release baseline in active docs instead of
  old concrete tags that can look like current instructions.
