# Administrator and User Guide

[Open or download the illustrated PDF guide](ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1.pdf)

The primary published guide is a searchable 144-page PDF with searchable text,
a linked table of contents and the revision 3 landscape process-flow appendix.
The [editable Word source](ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1.docx)
is retained for maintenance.

Reviewed **2 November 2026** against merged application revision
`ea9dcf0e46a66e7d1c3780fed7fb60c772bcf2ae`. The manual covers the
**v1.8.5-rc1 prerelease**; **v1.8.4 remains Latest stable**.
It preserves the supplied guide's original portrait pages, typography, tables,
headers and footers. A landscape appendix adds the revision 3 process overview
and two enlarged stage views. The body includes current Disaster Recovery and
guided-update procedures, bootstrap/health ordering and navigation. Its 75 inline
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
PostgreSQL migration/rollback guidance. These additions were reviewed against
updated source on 2 November and are separate from the immutable earlier bundle.
Users, Sessions, revocation and Foundation VM guidance use fresh generic simulated
captures. Video Part 11 predates the panel and remains unchanged. Foundation VM
is labelled Implemented; mutation and approval gates remain in place.
No unfinished deployment-engine work is included.

PDF SHA256: `3b4a1b32e06610b2d8723124b565e84918f73bec77bdc952e246a3cf62017556`.

Editable source SHA256: `774efa3c3acbdfa297eb05160518452540038e0e1589e65c5a24ade32bda31d0`.

[Revision 3 deployment process](../cluster-deployment-process.md) provides
the full-resolution PNG, editable SVG and accessible text sequence. Its approval
and verification boundaries also apply to the illustrated appendix.

## Related procedures

- [Illustrated Disaster Recovery setup](../disaster-recovery-setup.md): separate
  nine-page supplement reviewed against `867fe83` on 29 October 2026, with
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
