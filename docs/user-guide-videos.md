# ZTF-Orchestrator User Guide Videos

## Build #72 operator update - 26 November 2026

[Verified Standard, Airgap and Minimal downloads, checksums and first-boot instructions](appliance-build-72.md)
use application source `f9eee7e`. Fresh QCOW2 appliances enable reviewed Foundation VM
deployment by default and establish a versioned rollback baseline without manual
retagging. Administrator authorization, exact deployment confirmation, configured
approvals and preflight remain required. Existing environment overrides are retained;
an update ZIP does not rerun factory bootstrap. No startup action deploys a cluster.

Use [pipeline datacenter/cluster organization](pipeline-organization.md),
[workflow execution settings](workflow-execution-settings.md) and
[PE TLS options](pe-tls-options.md) for current controls. Pipelines, approvals,
completed recovery work and the eligible step 08-only recovery retry are preserved.
[Video currency notes](video-current-guidance.md) identify dated narration that
must be read with current written procedures.


**v1.8.5-rc1 | 27 November 2026 | 23 core videos plus the separate extended Part 23**

[Watch the refreshed series](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=00).
The light-mode player provides Joanna studio narration, burned-in English captions,
MP4 downloads, transcripts, SRT/VTT captions and seekable chapters. After opening a
transcript, use Back to return to the same part and timestamp, paused.

[Download all 23 videos (27 November 2026 ZIP)](https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/v1.8.5-rc1/ZTF-Orchestrator-User-Guide-Videos-Revised-2026-11-27-r2.zip) |
[SHA-256 checksum](https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/v1.8.5-rc1/ZTF-Orchestrator-User-Guide-Videos-Revised-2026-11-27-r2.zip.sha256).
Includes an offline player, transcripts, English SRT/VTT captions and chapter files.
Extract the ZIP completely, then open `index.html`.

## Current narration revision: 27 November 2026

Parts **05 and 18–21** use the five approved replacement scripts and the same Joanna voice. Light-mode illustrated controls, burned-in English captions, transcripts, SRT/VTT and all five chapter sets were rebuilt against actual speech timings. The new recordings explain per-operation PE TLS exceptions and current live-application defaults while preserving identity, approval and verification requirements.

The other 18 core videos and the separate extended Part 23 are unchanged. The new 23-part ZIP includes the five replacements. ZIP revision 2 uses LF checksum files for direct Windows and Linux verification; the videos are unchanged from the initial 27 November archive. Earlier ZIPs remain available as dated editions. [Current verification](assets/user-guide-videos/Narration-refresh-verification.json).

## Extended walkthrough: Part 23

[Watch Cluster Deployment and Pipeline Progress (4:56)](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=23).
Added 23 November 2026 with Joanna narration, light mode and English captions.
Actual Jobs / Queue and pipeline-runner UI captures use anonymised simulated
telemetry; accelerated progress is not a measured live deployment. No cluster
was contacted. Steps 01–09 are the example pipeline; Uplink Migration, VS0 MTU
and DARE follow as separate governed workflows, preserving all twelve steps.

[Download Part 23 MP4](https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/v1.8.5-rc1/ZTF-Orchestrator-User-Guide-Part-23-Cluster-Deployment-and-Pipeline-Progress-2026-11-23.mp4) |
[Captions, transcript and chapters](https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/v1.8.5-rc1/ZTF-Orchestrator-User-Guide-Part-23-Cluster-Deployment-and-Pipeline-Progress-Companions-2026-11-23.zip) |
[SHA-256 checksums](https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/v1.8.5-rc1/ZTF-Orchestrator-User-Guide-Part-23-Cluster-Deployment-and-Pipeline-Progress-2026-11-23-SHA256SUMS.txt).

The existing 22 November 23-part ZIP is unchanged and does not contain this
extended walkthrough. Existing Parts 00–22 and their URLs are retained.

## Retained 22 November introductions and Foundation coverage

Operators report consistent successful cluster deployments with pipeline post-configuration and successful cluster recoveries using ZTF Orchestrator.

Parts 00, 02, 03, 04 and 15 use this exact introduction, with Joanna studio
narration, light-mode visuals and timed English captions. Numeric deployment and
recovery totals are omitted. The overview labels Foundation VM as the selected
example while showing Foundation Central associated with Prism Central and
standalone Foundation Central Appliance as separate deployment paths. Part 02
retains its three-workflow comparison. Recovery-profile instructions retain their
Foundation VM scope. Earlier picture/caption audits below describe the historical
19 November edition; [22 November verification](assets/user-guide-videos/Update-verification.json)
and the [anonymisation report](assets/user-guide-videos/Anonymisation-report.json)
cover this revision. No live infrastructure was changed.

## Parts

| Part | Topic | Transcript |
|---|---|---|
| 00 | [ZTF-Orchestrator Overview](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=00) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-00-ZTF-Orchestrator-Overview-transcript.txt) |
| 01 | [Overview, Managed Clusters and Needs Attention](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=01) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-01-Dashboard-Overview-transcript.txt) |
| 02 | [Create Cluster Workflows and Deployment Use Cases](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=02) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-02-Deploy-a-Cluster-with-Foundation-VM-transcript.txt) |
| 03 | [Eight-Step Post-Configuration Pipeline](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=03) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-03-Post-Deployment-Configuration-Pipelines-transcript.txt) |
| 04 | [Recover Cluster and Resume Recovery](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=04) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-04-Disaster-Recovery-and-Cluster-Rebuilds-transcript.txt) |
| 05 | [PE Health, Drift and Collection Diagnostics](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=05) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-05-Monitoring-Drift-and-Upgrade-Readiness-transcript.txt) |
| 06 | [Guided Appliance Updates and Rollback](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=06) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-06-Guided-Appliance-Updates-and-Rollback-transcript.txt) |
| 07 | [Credential Groups, Config Files and Operational YAML Studio](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=07) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-07-Credentials-Config-Files-and-YAML-Studio-transcript.txt) |
| 08 | [ZTF 1.x Workflows, Scripts and Credential Changes](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=08) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-08-Workflows-Scripts-and-Local-PE-Administrators-transcript.txt) |
| 09 | [Jobs, Schedules, Parallel Execution and Approvals](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=09) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-09-Jobs-Schedules-Parallel-Execution-and-Approvals-transcript.txt) |
| 10 | [Upgrade Advisor and Readiness Evidence](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=10) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-10-Upgrade-Advisor-Assessments-and-Readiness-Actions-transcript.txt) |
| 11 | [Administration, Sessions, Audit and Backups](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=11) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-11-Administration-Settings-Audit-and-Backups-transcript.txt) |
| 12 | [Shared Validation Evidence and Historical Records](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=12) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-12-NKP-Framework-and-Validation-Evidence-Preview-transcript.txt) |
| 13 | [Supported Execution and Retired Integrations](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=13) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-13-ZTF-Two-Point-X-IaC-Preview-transcript.txt) |
| 14 | [Foundation Planning and Operating Boundaries](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=14) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-14-Native-Foundation-Baselines-and-Operating-Boundaries-transcript.txt) |
| 15 | [Disaster Recovery Start to Finish](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=15) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-15-Disaster-Recovery-Start-to-Finish-transcript.txt) |
| 16 | [AHV Appliance Deployment and SSH Setup](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=16) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-16-AHV-Appliance-Deployment-transcript.txt) |
| 17 | [Production Ubuntu VM Disk Expansion](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=17) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-17-Production-Ubuntu-VM-Disk-Expansion-transcript.txt) |
| 18 | [AHV Uplink Migration and a New Virtual Switch](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=18) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-18-AHV-Uplink-Migration-and-a-New-Virtual-Switch-transcript.txt) |
| 19 | [PE-Direct Data-at-Rest Encryption](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=19) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-19-PE-Direct-Data-at-Rest-Encryption-transcript.txt) |
| 20 | [VS0 MTU Change and Approved Rollback](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=20) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-20-VS0-MTU-Change-and-Approved-Rollback-transcript.txt) |
| 21 | [Cluster Storage Standard](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=21) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-21-Cluster-Storage-Standard-transcript.txt) |
| 22 | [Unregister Prism Element from Prism Central](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=22) | [Read](assets/user-guide-videos/ZTF-Orchestrator-User-Guide-Part-22-Unregister-Prism-Element-from-Prism-Central-transcript.txt) |

## Choose the deployment workflow

Choose the workflow that matches the deployment service available at the site:

| Workflow | When to use it | Required deployment service |
|---|---|---|
| **Cluster Create (Foundation VM)** | Image physical nodes and form an AHV cluster using a classic Foundation VM. Useful for a local or remote site with its own Foundation VM and for approved cluster rebuilds. | Reachable Foundation 5.x service, approved images and Foundation-to-node access. Prism Central is not the imaging service for this path. |
| **Cluster Create** | Use the existing ZTF 1.x Foundation Central path when nodes and images are managed through Foundation Central associated with Prism Central. | Configured Foundation Central endpoint, credentials and eligible discovered nodes. |
| **Cluster Create (Standalone FCA)** | Use a separately deployed Foundation Central Appliance and its Lifecycle APIs instead of the classic Foundation VM or PC-associated Foundation Central path. | Compatible standalone FCA Lifecycle API and inventory; guarded execution and explicit acknowledgement. Validate the actual appliance, hardware and software combination. |

These workflows use different services and configuration schemas; their YAML is
not interchangeable. Node discovery, image readiness, approvals and verification
must be checked in the selected path. **Site Deploy** / **Site Deploy (Standalone
FCA)** are broader site/multiple-cluster workflows; **Imaging Only** prepares nodes
without forming a cluster.

Part 02 follows one four-node example through all three Create Cluster choices,
explaining which service each uses, its prerequisites and its operational use
case. Use the [deployment guidance](start-here.md#deploy-a-cluster) to choose the
matching workflow and YAML schema before following its procedure.

## Current refresh

Twenty-one revised/new recordings align with the refreshed 156-page
[Administrator and User Guide](manuals/README.md), repository `63fb536` and
application source `f33c9ed`. Parts 16 and 17 retain their current static-IP-first
appliance deployment and Ubuntu disk-expansion narration unchanged. Their later picture corrections are documented below.

Coverage includes operational YAML Studio, credential and Config Files groups,
Foundation feedback, Recover Cluster / Resume Recovery, preserved completed work,
step 08-only recovery retry, PE health diagnostics, sessions and approvals.
Parts 18–22 add PE-direct AHV uplink migration, PE-direct DARE, PC-managed VS0 MTU,
Cluster Storage Standard and Prism unregistration. Each retains its documented
trust, approval, validation and hardware-validation boundaries.

Parts 12 and 13 now explain shared evidence and supported execution/retired
integrations. Their legacy filenames preserve existing links; they do not teach
current NKP or ZTF 2.x launch paths. ZTF 1.x remains the pipeline executor.

## Evidence and maintenance boundaries

Console captures use simulated generic records. Explanatory graphics illustrate
sequences rather than actual job or target verification. No live infrastructure
changes were executed. Workload restoration remains with the backup platform.
Videos do not establish hardware validation or change installed appliances.

Technical decoding, caption alignment, chapter timing, encoded visual samples and
player navigation were checked. A complete human listening/pronunciation review
has not been performed. The series remains 1080p H.264/AAC: Part 17
preserves its original 30 fps; the other parts use 24 fps. Captions are burned in; an additional subtitle layer
may duplicate them.

All 23 MP4s and their companions are served together on Pages, including Part 15.
[SHA256SUMS](assets/user-guide-videos/SHA256SUMS) and the
[series manifest](assets/user-guide-videos/series-manifest.json) record integrity
and source provenance. Media remains excluded from Docker by the docs exclusion.
See [current status](current-status.md), [Disaster Recovery](disaster-recovery.md)
and [guided updates](guided-appliance-updates.md) for operational procedures.

## Caption rendering repair — 19 November 2026

The encoded-caption audit found missing or stale captions in Parts 00–01,
03–15 and 18–22. Those 20 picture tracks were rebuilt from their clean source
image timelines, expanding to 24 fps **before** evaluating ASS subtitle events.
Existing AAC audio, decoded audio, narration, subtitle wording, chapter times
and stable filenames are preserved. Parts 02, 16 and 17 passed and remain unchanged.

The [caption audit report](assets/user-guide-videos/caption-render-audit.json)
records comparison results at every cue midpoint and qualifying speech gap.
Each encoded crop is compared with its independent subtitle reference rather
than relying on a valid SRT file or a successful decoder exit code.

For future still-image tutorial edits, use the
[caption-aware renderer](../scripts/render_captioned_still_timeline.py).
Feed it the reviewed clean image concat timeline, its ASS captions and the
existing audio source; render to a new output file. Do not add another caption
layer over an already captioned video. The FFmpeg CI regression test holds one
image while two captions appear, change and clear, and checks audio preservation.
This is a media-authoring tool; it adds no appliance runtime dependency.

## Part 06 visual correction — 19 November 2026

[Guided Appliance Updates and Rollback](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=06)
now shows **Appliance Ops → Updates**, replacing the incorrect Setup & Install
framework imagery. It demonstrates storage review, imported ZIP readiness, exact
version approval, completed/current stages, running-image verification and the
previous-image rollback controls. Rollback restores the application image;
database/data recovery is separate and target-side changes are not undone.

The actual light-mode interface uses intercepted example responses. No appliance
update or rollback was executed. Existing Joanna narration, English caption
wording, chapter timings and the Part 06 URL remain unchanged. All 26 caption
cues and nine speech-gap samples passed decoded-frame checks. The
[visual correction record](assets/user-guide-videos/part06-visual-correction.json)
records scene provenance and unchanged audio/chapters. Other recordings are unchanged.

## Visual-topic audit — 19 November 2026

After correcting Part 06, all remaining **22 videos** were checked against their
chapter narration and aligned sentence text: **115 chapters and 434 semantic
visual states**. Mismatched controls, example states and explanatory graphics
were corrected in all 22 picture tracks. Part 06 remains byte-for-byte unchanged.

Existing Joanna AAC audio, decoded audio, packet timing, English SRT/VTT and
transcript wording, embedded chapter metadata and player chapter links are
preserved. All **891 caption/gap samples** in the revised tracks passed decoded
frame checks. Corrections received a second visual review; this is not a complete
independent listening review or a semantic inspection of every animation frame.

[Per-part visual audit and preservation record](assets/user-guide-videos/visual-topic-audit.json)

| Part | Corrected visual coverage |
| --- | --- |
| 00 | Separate authoring/save from separately approved execution; no job starts when saving. |
| 01 | Show a genuinely empty managed-cluster list and the selected cluster health detail. |
| 02 | Show the submitted deployment job when monitoring an outcome, retaining all three Create Cluster use cases. |
| 03 | Show an existing failed-registration recovery with reconciliation and fresh health before retrying only step 08. |
| 04 | Separate new recovery from resume; show current-run stages, approved bootstrap and post-bootstrap health. |
| 05 | Show Drift Detection for configuration comparison instead of Upgrade Advisor. |
| 07 | Distinguish Save grouping from Save to ZTF and show the reviewed YAML-to-pipeline handoff. |
| 08 | Show the appropriate Scripts actions for local-user creation and password changes. |
| 09 | Show expanded job evidence, current Approvals counts, actual schedule/parallel forms and interruption boundaries. |
| 10 | Show assessment-specific inventory, TLS exception, unknown values, finding provenance and saved snapshot evidence. |
| 11 | Show supported runtime status, sessions, actual Storage backup/restore controls and installed-build support evidence. |
| 12 | Show evidence source selection, provenance, retained historical NKP records and separate acceptance requirements. |
| 13 | Distinguish supported ZTF 1.x execution, retired definitions, saved recovery snapshots and installed-image identity. |
| 14 | Show Foundation-specific job evidence, target intent, deployment selection and the boundary of validation probes. |
| 15 | Separate new imaging, resume, bootstrap/health, conditional step 08-only retry and external workload-restore handoff. |
| 16 | Keep successful Netplan trial acceptance separate from failure timeout and restore commands. |
| 17 | Show an insufficient-space example initially and the same illustrative 120-GiB value in the resize field. |
| 18 | Show PE-direct discovery, new-switch selection, exact assignments, preflight and sequential host verification. |
| 19 | Show PE-direct Local KMS readiness, DARE-specific approval, irreversible enablement and separate key-backup evidence. |
| 20 | Show the actual MTU workflow, host/uplink preflight, PC requirements, verification boundaries and a fresh rollback plan. |
| 21 | Show the storage workflow, one consistent exact default-container identity, independent approval and verification before cleanup. |
| 22 | Show unregister intent, strict-trust identity lookup, dependency review, one guarded submission and separate PE cleanup. |

The screenshots use the actual light-mode interface with intercepted example
responses. Diagrams are labelled illustrations. New recovery, resume, and the
conditional step 08-only retry are distinct examples. Specialist approval and
verification scenes refer to their own workflow. No live cluster, appliance
update, approval decision or restore was executed. These videos do not establish
hardware validation or production certification.
