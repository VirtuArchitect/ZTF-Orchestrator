# Video currency and current operating guidance

Reviewed 27 November 2026 against application source `f9eee7e`. Parts **05 and
18–21** now use the five approved replacement scripts, the same Joanna voice,
light-mode illustrated controls and freshly aligned English captions/chapters.
The other 18 core recordings and the separate extended Part 23 remain unchanged.

## Current recordings

| Part | Guidance in the revised recording |
|---|---|
| 05: health collection | A reasoned per-collection PE TLS exception is available for deployment/recovery. Evidence retains that policy and is not labelled certificate-verified. Identity, membership, health and freshness checks remain. |
| 18: uplink migration | New deployment/recovery drafts offer a per-run PE TLS exception. Packaged application defaults on; explicit false overrides retain planning mode. Pinned CVM SSH keys, independent approval, exact confirmation and per-host verification remain required. |
| 19: DARE | PE-direct Local KMS operation supports a reasoned PE TLS exception. Packaged application defaults on. Supported state, licensing, approval and readback remain required. Encryption cannot be disabled after enablement; key recovery is a separate responsibility. |
| 20: MTU | PC networking still requires trusted PC HTTPS. PE TLS verification is optional per operation. Packaged application defaults on with explicit false overrides retained. Review the physical network, exact plan, confirmation and host readbacks. |
| 21: storage | Bind the per-operation PE TLS choice and reason to reviewed storage YAML. Exact default-container identity, conservative dependency checks, independent approval and verification remain enforced. |

## Deployment and retained operating guidance

Use [Build #72 downloads and first boot](appliance-build-72.md) for verified
Standard, Airgap and Minimal QCOW2 disks. **Fresh** Build #72 appliances enable
governed Foundation VM deployment at first boot. An offline update ZIP preserves
the existing environment setting; it does not opt an existing appliance in.
Administrator authorization, exact confirmation and configured approvals remain.

Part 02 retains all three Foundation workflow use cases. Part 03 retains its
pipeline sequence; use [datacenter/cluster pipeline organization](pipeline-organization.md)
for current authoring controls. Parts 04 and 15 preserve recovery approvals,
completed work and the eligible step 08-only retry. Recovery PE collection also
supports the reviewed per-collection TLS policy. See [PE TLS options](pe-tls-options.md).

Part 06's update procedure uses Build #72's source-pinned first-boot rollback
baseline without manual retagging. Older disks retain their own provisioning.
Part 11's administration guidance is supplemented by current
[scoped Operator/Viewer access](scoped-operations-access.md). Part 16's SSH-key,
static-networking and separate web-login sequence remains applicable; Minimal
needs registry access, while Standard/Airgap use preloaded images.

## Download edition and historical references

[Download the 27 November 2026 complete 23-part ZIP](https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/v1.8.5-rc1/ZTF-Orchestrator-User-Guide-Videos-Revised-2026-11-27-r2.zip)
| [SHA-256 checksum](https://github.com/VirtuArchitect/ZTF-Orchestrator/releases/download/v1.8.5-rc1/ZTF-Orchestrator-User-Guide-Videos-Revised-2026-11-27-r2.zip.sha256).

ZIP revision 2 uses LF checksum lists for direct GNU `sha256sum` verification. Earlier archive assets remain dated references.

The ZIP contains an offline player, all 23 core MP4s, transcripts, English SRT/VTT
captions and chapter files. Extract it fully before opening `index.html`.
Extended Part 23 remains a separate online/download supplement, using anonymised
accelerated UI telemetry rather than measured hardware deployment.

Earlier video ZIPs, retained Word guides and historical PDF editions keep their
original dates and embedded download URLs. The older reports in the media folder
describe their own snapshots; they do not certify the five newly recorded files.
Use the current narration-refresh report for this edition.

## Verification and limits

The five new videos passed complete stream decoding and audio-level checks.
All 149 new caption cues and held-image caption changes were checked, with 35
visual states decoded and representative encoded frames inspected. Chapters use
returned speech timings; narration stays at natural 1.0x speed. No full human
listening review was performed. See the [verification report](assets/user-guide-videos/Narration-refresh-verification.json).

These are illustrated, anonymised tutorials. They do not establish AHV import,
hardware compatibility or production acceptance. No live infrastructure was
accessed or changed. Existing pipelines, approvals and recovery records are
unchanged by this publication.
