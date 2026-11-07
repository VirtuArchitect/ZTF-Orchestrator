# ZTF-Orchestrator User Guide Videos

**v1.8.5-rc1 | 4 November 2026 refresh | 15 videos | approximately 45 minutes**

[Watch the full series, starting with 00. ZTF-Orchestrator Overview](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/).
Use the player to select a part or jump to a chapter. Each video has burned-in
English captions, an MP4 download, transcript, SRT/VTT captions and chapter markers.

The overview explains the operations console, saved YAML, credential references,
execution runtimes and Foundation handoff. It introduces deployment, post-configuration,
infrastructure recovery, monitoring and the boundaries of preview integrations.

## Parts

| Part | Topic | Transcript |
|---|---|---|
| 00 | ZTF-Orchestrator Overview | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-00-ZTF-Orchestrator-Overview-transcript.txt) |
| 01 | Dashboard Overview | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-01-Dashboard-Overview-transcript.txt) |
| 02 | Deploy a Cluster with Foundation VM | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-02-Deploy-a-Cluster-with-Foundation-VM-transcript.txt) |
| 03 | Post Deployment Configuration Pipelines | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-03-Post-Deployment-Configuration-Pipelines-transcript.txt) |
| 04 | Disaster Recovery and Cluster Rebuilds | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-04-Disaster-Recovery-and-Cluster-Rebuilds-transcript.txt) |
| 05 | Monitoring Drift and Upgrade Readiness | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-05-Monitoring-Drift-and-Upgrade-Readiness-transcript.txt) |
| 06 | Guided Appliance Updates and Rollback | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-06-Guided-Appliance-Updates-and-Rollback-transcript.txt) |
| 07 | Credentials Config Files and YAML Studio | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-07-Credentials-Config-Files-and-YAML-Studio-transcript.txt) |
| 08 | Workflows Scripts and Local PE Administrators | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-08-Workflows-Scripts-and-Local-PE-Administrators-transcript.txt) |
| 09 | Jobs Schedules Parallel Execution and Approvals | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-09-Jobs-Schedules-Parallel-Execution-and-Approvals-transcript.txt) |
| 10 | Upgrade Advisor Assessments and Readiness Actions | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-10-Upgrade-Advisor-Assessments-and-Readiness-Actions-transcript.txt) |
| 11 | Administration Settings Audit and Backups | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-11-Administration-Settings-Audit-and-Backups-transcript.txt) |
| 12 | NKP Framework and Validation Evidence Preview | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-12-NKP-Framework-and-Validation-Evidence-Preview-transcript.txt) |
| 13 | ZTF Two Point X IaC Preview | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-13-ZTF-Two-Point-X-IaC-Preview-transcript.txt) |
| 14 | Native Foundation Baselines and Operating Boundaries | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-14-Native-Foundation-Baselines-and-Operating-Boundaries-transcript.txt) |

## 4 November refresh

Parts 00, 01, 04, 05, 06, 07, 08, 10 and 11 were revised against source
`8c7843a`. The refresh covers managed clusters, PE evidence freshness, recovery
baseline review, guided-update progress, credential and configuration groups,
PE login-title configuration, Upgrade Advisor TLS controls and administrator
sessions. The other six parts retain their original recordings.

## Evidence and maintenance boundaries

The updated chapters use simulated captures and generic documentation fixtures.
Unchanged illustrations retain their original capture baselines, including
`ea9dcf0` and detailed recovery illustrations from `416a480`. Screens are not live cluster,
recovery or host-update evidence. No infrastructure actions were executed for these videos.
The synthetic voice is not a clone of a user. Technical decoding, caption timing,
chapter counts, final visual samples and player navigation were checked. A listening
review of pronunciation has not been performed.

NKP and ZTF 2.x retain Preview labels and their documented execution limits. Restoring
VMs/application data remains with the backup platform. The prerelease designation
is separate from the established paths' successful production use; v1.8.4 remains
Latest stable. The videos do not update an installed appliance or an immutable bundle.

Media checksums are in [SHA256SUMS](assets/user-guide-videos/SHA256SUMS).
Media lives under docs/assets and is copied into the GitHub Pages tutorial directory
by the Pages workflow. It is excluded from Docker by the existing docs exclusion.
See the [current manual](manuals/README.md), [static demo guide](demo/README.md),
[Disaster Recovery procedure](disaster-recovery.md) and [guided updates](guided-appliance-updates.md).

## Changes after the recorded videos

The revised videos reflect the 3 November source baseline, not every change in
later consolidated updates. Part 09 retains its original configuration-selection
illustration, and Part 04 predates recovery profile archive and deletion controls.
Use [current build status](current-status.md) and the written procedures for later
changes. The standalone demo and long-form recovery tutorial are separate.
