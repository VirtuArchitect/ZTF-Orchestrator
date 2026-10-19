# Release Directory

Public entry point: [Release documents](https://virtuarchitect.github.io/ZTF-Orchestrator/releases/).
Use that address for future public references; it is separate from the demo UI.

## Current Candidate

**v1.8.5-rc1** is the current controlled-UAT release candidate, not a stable
or production-certified release.

- [Published prerelease and offline update ZIP](https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/tag/v1.8.5-rc1)
- [Release notes](../../release-notes-v1.8.5-rc1.txt)
- [Installation checklist](../../install-checklist-v1.8.5-rc1.md)
- [Readiness gates and pending UAT](v1.8.5-rc1-readiness.md)
- [Current screenshots and provenance](../assets/readme/v1.8.5-rc1/README.md)

The offline update ZIP, Docker image tar and AHV appliance build artifacts are
different deliverables. Check the release asset descriptions and checksums;
the presence of an artifact does not establish successful site UAT.

## Stable Channel

[v1.8.4](https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/tag/v1.8.4)
remains the latest stable release. GitHub's sidebar **Latest** badge,
`/releases/latest`, and the container `latest` channel must not imply RC
acceptance. Use the explicit RC tag link above when testing the candidate.

## Historical Records

Historical notes and checklists were moved here unchanged to reduce root-folder
clutter. Their versions and original instructions are intentionally preserved;
they are not current installation guidance. Original root paths remain available
in historical Git tags and commits. External links targeting an old file on
`main` need to use a commit-pinned link below instead. GitHub does not redirect
individual moved repository files; this index cannot repair previously shared
`/blob/main/` or raw-file URLs.

The links below pin the archived snapshot to commit
`ba57890fae90a0bc5938140afc32753dfe871656`. They preserve the document contents
at archive time, not a claim that those contents match the original release tag.
Do not replace the SHA with `main` or rewrite historical records when adding a release.

| Version | Release Notes | Installation Checklist |
|---|---|---|
| v1.8.4 | [Notes](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/release-notes-v1.8.4.txt) | Not supplied |
| v1.8.3 | [Notes](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/release-notes-v1.8.3.txt) | Not supplied |
| v1.8.2 | [Notes](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/release-notes-v1.8.2.txt) | Not supplied |
| v1.8.1 | [Notes](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/release-notes-v1.8.1.txt) | Not supplied |
| v1.7.7 | [Notes](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/release-notes-v1.7.7.txt) | [Checklist](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/install-checklist-v1.7.7.md) |
| v1.7.4 | [Notes](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/release-notes-v1.7.4.txt) | [Checklist](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/install-checklist-v1.7.4.md) |
| v1.7.3 | [Notes](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/release-notes-v1.7.3.txt) | [Checklist](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/install-checklist-v1.7.3.md) |
| v1.7.1 | [Notes](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/release-notes-v1.7.1.txt) | [Checklist](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/install-checklist-v1.7.1.md) |
| v1.7.0 | [Notes](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/release-notes-v1.7.0.txt) | [Checklist](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/install-checklist-v1.7.0.md) |
| v1.6.0 | [Notes](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/release-notes-v1.6.0.txt) | [Checklist](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/install-checklist-v1.6.0.md) |
| v1.5.6 | [Notes](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/release-notes-v1.5.6.txt) | [Checklist](https://github.com/VirtuArchitect/ZTF-Orchestrator/blob/ba57890fae90a0bc5938140afc32753dfe871656/docs/releases/archive/install-checklist-v1.5.6.md) |

Historical audit screenshots under `docs/audits/`, earlier unversioned README
media and the earlier product video are retained as historical records. They
must not be relabelled as v1.8.5-rc1 captures. The main README uses the versioned
RC gallery instead. No tags, releases, deployment records or Git history were
deleted by this cleanup.

## Maintaining The Web Index

`public/releases/index.html` is a standalone, script-free document copied by
Vite into `dist-demo/releases/index.html`. The existing Pages workflow publishes
that directory without changing the demo's SPA fallback. Keep current channel
labels and the historical link sets aligned with this directory; release-integrity
tests check both. Update the indexes for a new release without changing existing
historical SHA links. No root compatibility stubs are required.
