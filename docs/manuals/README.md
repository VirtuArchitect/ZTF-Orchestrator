# Administrator and User Guide

[Download the illustrated Word guide](ZTF-Orchestrator-Administrator-and-User-Guide-v1.8.5-rc1.docx)

Reviewed **27 October 2026** against merged application revision
`4a010727d5db3496d17a52e4ce681818dcc56200`. The manual covers the
**v1.8.5-rc1 prerelease**; **v1.8.4 remains Latest stable**.
It preserves the supplied guide's original portrait pages, typography, tables,
headers and footers. A landscape appendix adds the revision 3 process overview
and two enlarged stage views; the existing body remains unchanged apart from
an opening pointer to that appendix. Its 45 application illustrations use the
[current simulated screenshot gallery](../assets/guide/v1.8.5-rc1/README.md),
including repeated dashboard/pipeline examples. They are not live target evidence.

This revision adds Start Here and the deployment/post-configuration handoff,
Docker build identity, safe PE local-user diagnostics, independent user/role
verification, the effective appliance Compose trust configuration and update
space planning. It retains detailed installation, workflow/script, pipeline,
Upgrade Advisor, live drift, backup, recovery and governance instructions.
No unfinished deployment-engine work is included.

Document SHA256: `d8b81e7a8bed8b902b25ce5a760ab6452b914d35a262ada9882d96d7ba97ef49`.

[Revision 3 deployment process](../cluster-deployment-process.md) provides
the full-resolution PNG, editable SVG and accessible text sequence. Its approval
and verification boundaries also apply to the illustrated appendix.

## Related procedures

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
