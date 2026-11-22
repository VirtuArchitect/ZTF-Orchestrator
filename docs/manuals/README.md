# ZTF-Orchestrator Documentation Collection

Browse the [PDF documentation library](https://virtuarchitect.github.io/ZTF-Orchestrator/documentation/) to search the collection, preview guides and download individual PDFs.

## Current source collection

The collection is reviewed against application source `db16219` on **21 November 2026**. Use the [collection overview](https://virtuarchitect.github.io/ZTF-Orchestrator/documentation/?doc=collection-overview), [current Administrator Guide](https://virtuarchitect.github.io/ZTF-Orchestrator/documentation/?doc=admin-guide), [current User Guide](https://virtuarchitect.github.io/ZTF-Orchestrator/documentation/?doc=user-guide) and [complete current task collection](https://virtuarchitect.github.io/ZTF-Orchestrator/documentation/?doc=current-workflow-script-collection). Every current workflow, script and dedicated operation also has an individual PDF.

Runbooks, architecture, API references, installation, updates, recovery, security, test guidance and the provided remote deployment design/pilot are searchable by topic and document type. Current guides retain the ZTF cover and running format. Historical editions are hidden by default and retain their source provenance and original edition labels. Source review and simulated figures do not establish hardware or production acceptance.

The [source register](current/collection-register.json) records publication dispositions, source fingerprints and provided-document provenance. The [maintenance guide](../pages/documentation-library.md) describes review, regeneration and publication.

## Earlier workflow and script editions

### Earlier editions with corrected standard cover and format

The **21 November 2026** format-corrected editions retain the earlier source `79c3ecc`. They preserve the original ZTF
Operational Quick Guides cover and matching page layout:
[illustrated PDF](./ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Illustrated-Branded.pdf) ·
[illustrated Word](./ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Illustrated-Branded.docx) ·
[screenshot PDF](./ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Screenshots-Branded.pdf) ·
[screenshot Word](./ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Screenshots-Branded.docx) ·
[text PDF](./ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Branded.pdf) ·
[text Word](./ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Branded.docx).
See the [format reference](../assets/quick-guides/branding/README.md),
[checksums](ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Branded-SHA256SUMS.txt) and
[branding manifest](workflow-script-quick-guides-branding.json).
Original source content and edition provenance remain recorded; earlier editions
below are retained for comparison.

### Previous editions


The **illustrated edition** adds 117 task-specific simulated console screenshots:
[279-page PDF](ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Illustrated.pdf) ·
[editable Word](ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Illustrated.docx).
For images alone, use the [122-page screenshot companion](ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Screenshots.pdf),
[PNG and offline-gallery ZIP](ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Screenshots.zip)
or [online-style local gallery](../assets/quick-guides/2026-11-20/gallery.html).
See [screenshot provenance](../assets/quick-guides/2026-11-20/README.md) and
[checksums](ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Screenshots-SHA256SUMS.txt).
These initial-screen/authoring views do not demonstrate live target execution.
The original text edition below retains its source content and format.

The earlier quick-guide editions, reviewed 20 November
2026 against source `79c3ecc`, cover all 30 current workflows, 79 scripts and
eight dedicated operator flows. Sixteen retired catalogue entries have separate
historical reference notes. Each task includes prerequisites, inputs, steps,
verification and recovery. Download the [complete PDF](ZTF-Orchestrator-Workflow-and-Script-Quick-Guides.pdf)
or [editable Word collection](ZTF-Orchestrator-Workflow-and-Script-Quick-Guides.docx).
These source-reviewed procedures do not establish live target compatibility.
The collection has 162 pages with linked contents. [Checksums](ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-SHA256SUMS.txt)
and the [collection manifest](workflow-script-quick-guides-collection.json) identify
the exact files; see the [earlier validation record](../quick-guides/VALIDATION-PREVIOUS-EDITIONS.md).

## Earlier combined Administrator and User Guide downloads

[Download the illustrated PDF guide](https://virtuarchitect.github.io/ZTF-Orchestrator/documentation/files/ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1.pdf) · [Download the editable Word guide](https://github.com/VirtuArchitect/ZTF-Orchestrator/raw/refs/heads/main/docs/manuals/ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1.docx)

The **19 November 2026** release assets record the earlier publication. Maintained downloads now include the **22 November 2026** address anonymisation and operational-experience revisions and have refreshed checksums below. The release remains a prerelease. Repository copies remain available: [PDF](ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1.pdf) · [Word](ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1.docx).

The maintained **156-page** guide was reviewed **19 November 2026** against application source `f33c9ed` and repository/README revision `27d28a2`. **v1.8.5-rc1 remains prerelease; v1.8.4 remains Latest stable.** The maintained repository filenames are unchanged.

The Word and searchable PDF retain the original typography, navy table headers, portrait pages, margins, headers/footers and revision 3 landscape process appendix. The linked contents and page fields were refreshed in Word. All 156 exported pages were rendered and checked; 83 inline illustrations and 54 tables remain in the source.

The training references on page 77 link all [23 revised videos](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=00), the [complete revised offline ZIP](https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/v1.8.5-rc1/ZTF-Orchestrator-User-Guide-Videos-Revised-2026-11-22.zip) and its [SHA-256 checksum](https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/v1.8.5-rc1/ZTF-Orchestrator-User-Guide-Videos-Revised-2026-11-22.zip.sha256). The ZIP includes the offline player, transcripts, English SRT/VTT captions and chapter files. Existing per-part URLs remain unchanged.

On **22 November 2026**, page 14 was revised to use this exact statement: Operators report consistent successful cluster deployments with pipeline post-configuration and successful cluster recoveries using ZTF Orchestrator. The workflow catalogue on page 47 and deployment guidance on page 80 now distinguish classic Foundation VM, Foundation Central associated with Prism Central and standalone FCA, with use cases and matching YAML requirements. The maintained Word/PDF retain their original source review and edition. Only two Word XML parts changed; all 156 PDF pages were rendered and compared, with the other 152 pages pixel-identical. All 54 tables, 83 inline illustrations, styles, page geometry, headers and footers remain unchanged.

## Operating coverage of the earlier combined guide

- YAML Studio: datacenter/cluster context, guided configuration, Advanced YAML, authoring validation and reviewed pipeline handoff. Validation and handoff start no target execution.
- ZTF 1.x workflow/script pipelines, credential synchronization, credential and Config Files grouping, exact saved-step naming, job logs and reported failure stages.
- Recover Infrastructure, Recover Cluster and Resume Recovery; profile revisions/archive/guarded deletion; retained approvals and completed work; final step 08-only registration retry after reconciliation and fresh health evidence.
- Managed cluster records, owned attention reviews, collection errors, expired evidence and clock mismatch; deliberate verified-HTTPS PE collection.
- PE-direct AHV uplink migration/new virtual switches through pinned CVM SSH, and DARE with existing Local KMS. Per-run TLS exceptions remain reasoned, audited and independently approved. Live writes default to off pending target-version validation; DARE cannot be undone by appliance rollback.
- Foundation image inventory and four-button feedback, per-node IPMI test source/results, actual Foundation telemetry, sessions/revocation, blue zero Approvals count and guided appliance update/backup/rollback.
- Static-IP-first appliance access, console provisioning, Netplan permissions and the web-admin retrieval/reset handoff to the detailed deployment quick guide.

Native pipeline opt-in, NKP and ZTF 2.x console execution are **retired**. Historical jobs, approvals, baked runtimes and dated illustrations remain for interpretation/retention; they do not provide a current execution option. See [console retirement](../console-retirement.md).

## Screenshots and release boundaries

[Current light-mode captures](../assets/guide/2026-11-19/README.md) use generic simulated records. Earlier detailed recovery/update images and process diagrams retain their original provenance and are identified as historical. Fixed demo timestamps can display clock warnings; screenshots are not live health or hardware evidence.

The example consolidated build is `v1.8.5-rc1-f33c9ed`. Obtain its exact trusted ZIP and checksum from the release maintainer; this is not a claim that a commit-specific bundle is a public release asset. This manual update changes no installed runtime or immutable ZIP. See [current source/package evidence](../current-status.md).

PDF SHA256: `9f83535cf9585c6df818efff9d7f7b20499baa1b6616161962e71bc5add8a79a`.

Editable source SHA256: `92aa7eb73ab272012cbeb3a3584f3191edd3ccc3abbd037596d18f6be069b5a8`.

[Publication manifest](administrator-user-guide-publication.json) records source revisions, page count, layout geometry and download checksums.

[Revision 3 deployment process](../cluster-deployment-process.md) provides the full-resolution PNG, editable SVG and accessible text sequence retained in the appendix.

## Related procedures

[Illustrated Production Ubuntu VM Disk Expansion Guide (Word)](ZTF-Orchestrator-Production-Ubuntu-VM-Disk-Expansion-Guide.docx) covers disk sizing in Nutanix Prism, Ubuntu filesystem expansion, guided update readiness and rollback. The screenshots and terminal example use reference data.


[Illustrated v1.8.5-rc1-c660955 UAT update and verification guide (Word)](ZTF-Orchestrator-UAT-Update-and-Verification-v1.8.5-rc1-c660955.docx) is a historical build-specific guide covering guided update readiness, former Native opt-in,
compatibility results, the offline step 08-only retry rehearsal, and rollback.
Screenshots use simulated records. Native opt-in is retired in the current console; use the current manual for supported ZTF 1.x operation.

- [AHV Appliance Deployment Quick Guide (PDF)](ZTF-Orchestrator-AHV-Appliance-Deployment-Quick-Guide.pdf) covers QCOW2 deployment, SSH key generation and `ztfadmin` provisioning before first boot, management addressing, SSH and sudo verification, and the initial web admin sign-in.

- [Illustrated Disaster Recovery setup](../disaster-recovery-setup.md): separate
  nine-page supplement refreshed against `a3c9c79` on 2 November 2026, with
  generic simulated screenshots of datacenter creation, Foundation VM/pipeline
  links and a reviewed baseline. [PDF](ZTF-Orchestrator-Disaster-Recovery-Setup-v1.8.5-rc1.pdf)
  and [editable Word](ZTF-Orchestrator-Disaster-Recovery-Setup-v1.8.5-rc1.docx).
  It verifies setup without deployment and remains a focused supplement; it does
  not establish physical recovery readiness. See
  [screenshot provenance and checksums](../assets/disaster-recovery/setup-v1.8.5-rc1/README.md).

- [Administrator guide](../admin-guide.md)
- [User guide](../user-guide.md)
- [Installation guide](../installation-guide.md)
- [Start Here and deployment guidance](../start-here.md)
- [PE post-configuration verification](../pe-post-configuration-verification.md)
- [PE local users and diagnostics](../pe-local-users.md)
- [Persistent PE certificate trust](../pe-certificate-trust.md)
- [Live PE drift](../live-pe-drift-monitoring.md)
- [Docker build identity](../docker-build-identity.md)

Historical releases retain their version-specific instructions in the
[release-document index](../releases/README.md). A documentation update does not
change an installed image, update a previously downloaded bundle or promote the
candidate to stable. Verify exact installed build metadata independently.

- [Full-console video series, beginning with Overview 00](../user-guide-videos.md)

- [AHV appliance build guide PDF](../AHV-Appliance-Build-Guide.pdf) and [editable Word](../AHV-Appliance-Build-Guide.docx), with current post-boot/update guidance.
- [Credential groups](../credential-groups.md)
- [Config Files grouping](../config-file-groups.md)
- [PE login-title procedure](../pe-login-title.md)

- [Upgrade Advisor temporary TLS exceptions](../upgrade-advisor-tls.md): current procedure addendum; earlier manual editions describe the verified-only collector.

## Address anonymisation

On 22 November 2026, remaining illustrative IP addresses in current and historical collection PDFs, editable Word editions and screenshot downloads were replaced with documentation-only TEST-NET examples. Covers, layout, original edition labels and application-source provenance are retained. John Goulden attribution is retained. Fixed protocol endpoints, loopback/bind addresses and subnet masks remain technically accurate. Historical validation statements refer to their original environments, not tests against TEST-NET. Earlier immutable GitHub release assets, Git history and previously downloaded copies are separate from this republished collection; use the collection links above for the anonymised editions.

The maintained Word/PDF now link the revised video edition. Earlier dated release assets remain available as historical snapshots.
