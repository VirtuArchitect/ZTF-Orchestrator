# Video currency and current operating guidance

Reviewed 26 November 2026 against application source `f9eee7e` and the
Build #72 verification records. Recordings retain their original production
dates, voice, captions and simulation boundaries. A current link does not make
an older recording a new build demonstration.

## Before following a recording

Use [Build #72 downloads and first boot](appliance-build-72.md) for the verified
Standard, Airgap and Minimal disks. Existing ZIPs, retained Word editions and
older QCOW2 disks are immutable. New documentation does not alter their contents.
The [PDF collection](https://virtuarchitect.github.io/ZTF-Orchestrator/documentation/)
shows each document's review/source provenance.

| Video | Current guidance to use alongside the recording |
|---|---|
| Part 02: cluster deployment | All three Foundation workflow use cases remain distinct. Build #72 enables reviewed Foundation VM submission by default; administrator authorization, exact confirmation, configured approvals and preflight still apply. No automatic imaging occurs. |
| Part 03: pipelines | Select a datacenter/cluster under Pipelines and create the pipeline there. Labels organize records; YAML selects actual targets and saved credential references. Existing pipelines and the eligible recovery registration-only retry are retained. See [pipeline organization](pipeline-organization.md). |
| Part 06: updates | Build #72 establishes a source-pinned rollback baseline at first boot. No manual retag is required for these disks. Existing Build #67 installations need their own readiness assessment; an application ZIP does not retrofit factory provisioning. See [bootstrap identity](appliance-bootstrap-identity.md). |
| Part 11: administration | Operator/Viewer visibility and execution are restricted by server-side permissions. Administrators can assign reusable permission profiles to selected datacenters/clusters; labels alone never grant access. Use the current [Administrator Guide](admin-guide.md) and installed access-management controls. |
| Part 16: AHV deployment | The access, SSH-key and static-network sequence remains applicable. Download the exact Build #72 profile and verify its matching SHA-256. Standard/Airgap use preloaded images; Minimal needs registry access. Retain dated recording provenance. |
| Part 18: uplink migration | Older narration says PE TLS verification is on by default and writes are disabled. Current new deployment/recovery drafts offer an audited PE TLS exception. Packaged live application defaults on; explicit false overrides retain planning mode. Pinned CVM SSH keys, independent approval, exact confirmation and per-host checks remain required. See [uplink migration](ahv-uplink-migration.md). |
| Part 19: DARE | Older narration says to retain PE certificate verification and that writes default off. Current PE-direct drafts offer an audited per-run PE TLS exception and packaged live application defaults on. Identity, supported state, Local KMS, licensing, approval and verification still apply. DARE cannot be disabled after enablement. See [DARE](dare-workflow.md). |
| Part 20: MTU | The PC-managed MTU path still requires trusted PC HTTPS; PE TLS verification is optional per operation. Packaged live application defaults on, with explicit false overrides honored. Preflight, exact approval/confirmation, physical-network validation and verified readback remain necessary. See [MTU](change-virtual-switch-mtu.md). |
| Extended Part 23 | Accelerated UI progress uses anonymised simulated telemetry, not measured live hardware deployment. Apply the current PE TLS/default settings above when following its network/encryption chapters. |

Parts 00, 01, 04, 05, 07–10, 12–15, 17, 21 and 22 retain their stated topic and
operating scope. Their narrated procedures were checked for build/default
conflicts; this review does not establish hardware compatibility. Parts 18–20
require revised narration before they can be described as fully refreshed.
Pending that revision, the player and download guidance explicitly identify these
recordings as dated and direct operators to the corrected written procedures.

## Preserved media and acceptance boundaries

The existing Joanna audio, light-mode recordings, English captions, transcripts,
chapter files and complete 23-part ZIP are retained with their original hashes.
The extended Part 23 remains a separate download. New narration requires approval
of its exact wording before recording; do not silently replace the transcript or
captions while retaining contradictory audio.

No live cluster operation is needed to audit media, inspect captions, test chapter
links or verify download availability. Approvals, completed recovery work and the
eligible step 08-only retry are runtime records and are unchanged by this
documentation publication.
