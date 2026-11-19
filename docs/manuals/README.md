# Administrator and User Guide

[Open or download the illustrated PDF guide](ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1.pdf) · [Editable Word guide](ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1.docx)

The maintained **156-page** guide was reviewed **19 November 2026** against application source `f33c9ed` and repository/README revision `27d28a2`. **v1.8.5-rc1 remains prerelease; v1.8.4 remains Latest stable.** Existing download filenames and links are unchanged.

The Word and searchable PDF retain the original typography, navy table headers, portrait pages, margins, headers/footers and revision 3 landscape process appendix. The linked contents and page fields were refreshed in Word. All 156 exported pages were rendered and checked; 83 inline illustrations and 54 tables remain in the source.

The training references on page 77 now link all [23 corrected videos](https://virtuarchitect.github.io/ZTF-Orchestrator/tutorials/?part=00), the [complete offline ZIP](https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/v1.8.5-rc1/ZTF-Orchestrator-User-Guide-Videos-Corrected-23-Part-2026-11-19.zip) and its [SHA-256 checksum](https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/v1.8.5-rc1/ZTF-Orchestrator-User-Guide-Videos-Corrected-23-Part-2026-11-19.zip.sha256). The ZIP includes transcripts, English captions and chapter files. This narrow link refresh was checked against repository revision `fa962ba`: all 156 PDF pages were compared, with the other 155 pages pixel-identical. The original guide review provenance remains unchanged.

## Current operating coverage

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

PDF SHA256: `6a0d0ef25d2d9f148f8b79d616aa88df09c9ba311dc85cca7925ac59c84d0017`.

Editable source SHA256: `3469ef49a02b26d28bdaf2da2016660990a5620b1d684b417fafa16aad4396e3`.

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
