# Administrator and User Guide

[Open or download the illustrated PDF guide](ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1.pdf)

The primary published guide is a searchable 147-page PDF with searchable text,
a linked table of contents and the revision 3 landscape process-flow appendix.
The [editable Word source](ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1.docx)
is retained for maintenance.

Reviewed **2 November 2026** against merged application revision
`a3c9c79832efe4552cab5b208d5fbe49936dcbf8`. The manual covers the
**v1.8.5-rc1 prerelease**; **v1.8.4 remains Latest stable**.
It preserves the supplied guide's original portrait pages, typography, tables,
headers and footers. A landscape appendix adds the revision 3 process overview
and two enlarged stage views. The body includes current Disaster Recovery and
guided-update procedures, bootstrap/health ordering and navigation. Its 79 inline
illustrations include refreshed current console captures from the
[current simulated screenshot gallery](../assets/guide/v1.8.5-rc1/README.md),
including repeated dashboard/pipeline examples. They are not live target evidence.

This revision includes the streamlined console, Disaster Recovery bootstrap and
health gates, guided appliance updates, host-service installation, conservative
backup/cleanup and rollback guidance. It retains Start Here and the deployment/post-configuration handoff,
Docker build identity, safe PE local-user diagnostics, independent user/role
verification, the effective appliance Compose trust configuration and update
space planning. It retains detailed installation, workflow/script, pipeline,
Upgrade Advisor, live drift, backup, recovery and governance instructions.
The updated source documentation adds administrator-only session visibility,
five-minute recent activity, 30-second interaction reporting with stale reports
discarded after 60 seconds, confirmed UUID revocation/audit, and additive
PostgreSQL migration/rollback guidance. These additions are included in consolidated appliance bundle
`v1.8.5-rc1-636f191`; older immutable bundles remain unchanged.
Users, Sessions, revocation and Foundation VM guidance use fresh generic simulated
captures. Video Part 11 predates the panel and remains unchanged. Foundation VM
is labelled Implemented; mutation and approval gates remain in place.
No unfinished deployment-engine work is included.

The manual now includes datacenter/cluster credential and configuration groups,
scoped workflow/pipeline file selection, **Set Prism Login Title (PE)** and green
completed update stages. Consolidated bundle **v1.8.5-rc1-636f191** includes those
application changes; this documentation refresh does not alter that ZIP. See the
[current build inventory](../current-status.md). Dated detailed recovery and
update walkthrough figures retain their stated historical provenance; the general
console figures and update-progress example were freshly captured.

PDF SHA256: `2bc3b8b1f75ae808526da4c3c65a0ea968a1ee7dabe02cb69f08921a50cb4ca1`.

Editable source SHA256: `932d2dcb14e7f4f823e38cb54f4931bc1ba5908d0073306d8d49717b4c501350`.

[Revision 3 deployment process](../cluster-deployment-process.md) provides
the full-resolution PNG, editable SVG and accessible text sequence. Its approval
and verification boundaries also apply to the illustrated appendix.

## Related procedures

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
