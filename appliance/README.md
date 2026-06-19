# ZTF-Orchestrator Appliance Kit

This directory contains the reproducible appliance assets for deploying
ZTF-Orchestrator as a small Linux VM on AHV or any other virtual platform.

Do not commit built VM images to Git. Publish large appliance outputs such as
QCOW2 files as GitHub Release artifacts.

## Recommended Distribution Model

1. Build a QCOW2 appliance in a connected staging environment.
2. Bake the ZTF-Orchestrator container image into that QCOW2.
3. Deploy the small Linux VM on AHV.
4. Store generated secrets only on the appliance VM.
5. Attach any generated QCOW2 image to a versioned GitHub Release.

## Contents

| Path | Purpose |
|---|---|
| `docker-compose.appliance.yml` | Runtime Compose file using the configured ZTF-Orchestrator image tag |
| `scripts/install-docker.sh` | Installs Docker Engine and the Compose plugin |
| `scripts/firstboot.sh` | Clones or reuses baked source, creates `.env`, installs systemd, and starts the appliance |
| `scripts/build-ahv-qcow2.sh` | Local wrapper for building the AHV QCOW2 with Packer and QEMU |
| `systemd/ztf-orchestrator.service` | Systemd wrapper for Docker Compose |
| `systemd/ztf-orchestrator-firstboot.service` | Optional first-boot unit for baked images |
| `cloud-init/user-data.example` | Example first-boot cloud-init payload |
| `cloud-init/user-data.packer` | Insecure temporary build seed used only by Packer |
| `cloud-init/meta-data` | Minimal NoCloud metadata example |
| `packer/ahv-qcow2.pkr.hcl` | Reference Packer template for a QCOW2 image |

## AHV VM Sizing

| Resource | Recommended |
|---|---|
| vCPU | 2 |
| RAM | 4-8 GB |
| Disk | 80-100 GB |
| OS | Ubuntu Server 24.04 LTS or Rocky Linux 9 |
| Network | Management VLAN with access to Prism Central, Foundation Central, Prism Element/CVMs, DNS, NTP, Git, and IPAM |

## Quick Deploy on a Fresh Ubuntu VM

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates
git clone https://github.com/VirtuArchitect/ZTF-Orchestrator.git /opt/ztf-orchestrator-source
sudo bash /opt/ztf-orchestrator-source/appliance/scripts/firstboot.sh
```

Open:

```text
http://<vm-ip>:5001
```

For production-style use, put nginx or another reverse proxy with TLS in front
and restrict access to admin networks.

## Version Pinning

By default, the appliance uses the `latest` GHCR image. To pin a release:

```bash
sudo ZTF_ORCHESTRATOR_VERSION=v1.3.0 \
  bash /opt/ztf-orchestrator-source/appliance/scripts/firstboot.sh
```

The first-boot script writes this value into `/opt/ztf-orchestrator/.env`.

The current appliance image is built with ZeroTouch Framework `v1.5.2` because
ZTF-Orchestrator's workflow and script launcher targets the legacy 1.x
`main.py --workflow/--script` CLI. ZeroTouch Framework v2.0.0 uses a new
`ztf plan/apply` model and is not a drop-in replacement for these appliance
workflows.

The framework copy inside the appliance container is intentionally not a git
checkout. The Setup page may report that source update is skipped; that is
expected. Rebuild or pull a newer appliance image to change the bundled ZTF
version, or configure Settings to point at a separate cloned ZTF 1.x checkout.

## Secrets

The appliance kit never stores real secrets in Git. On first boot, the script:

- creates `/opt/ztf-orchestrator/.env` if it does not exist;
- generates a random `POSTGRES_PASSWORD` if one is not supplied;
- writes `ZTF_DATABASE_URL` using the generated password;
- leaves application admin password creation to ZTF-Orchestrator first start.

Retrieve the generated application admin password with:

```bash
sudo journalctl -u ztf-orchestrator -n 200 --no-pager
```

or:

```bash
cd /opt/ztf-orchestrator
sudo docker compose -f appliance/docker-compose.appliance.yml logs ztf-orchestrator
```

## Pre-Built AHV QCOW2 Appliance

The repository can produce an AHV-importable QCOW2 appliance image. The image is
built from Ubuntu Server cloud images, installs Docker Engine, stages the
ZTF-Orchestrator source tree, enables first-boot bootstrap, builds the
ZTF-Orchestrator container image locally, and attempts to preload the PostgreSQL
container image. It can also preload the NKP ZeroTouch Framework and NKP bundle
artifacts for disconnected NKP deployment preparation.

In v1.3.0 and later, the GitHub Actions workflow can publish named appliance
artifact profiles. v1.2.x remains the prior single-appliance workflow line.

The locally built container image bakes the legacy ZeroTouch Framework into:

```text
/opt/zerotouch-framework
```

inside the running `ztf-orchestrator` container. The default framework ref is
`v1.5.2`.

The NKP framework is staged on the appliance host at:

```text
/opt/ztf-orchestrator-preload/nkp-zerotouch-framework
```

and mounted read-only into the app container at:

```text
/var/lib/ztf-orchestrator/nkp-zerotouch-framework
```

NKP bundle artifacts are staged under:

```text
/opt/ztf-orchestrator-preload/bundles
```

and mounted read-only into:

```text
/var/lib/ztf-orchestrator/bundles
```

On first boot, the VM generates local secrets, creates `/opt/ztf-orchestrator`,
starts Docker Compose, and leaves the application admin password in the service
logs.

### Build from GitHub Actions

1. Open **Actions > Build AHV Appliance Image**.
2. Select **Run workflow**.
3. Choose an appliance artifact profile:

   ```text
   standard: connected staging appliance with baked app, PostgreSQL, ZTF, and NKP framework
   airgap: portable disconnected-site appliance with baked app, PostgreSQL, ZTF, and NKP framework
   minimal: smaller bootstrap appliance; defers image pulls and NKP staging
   all: builds standard, airgap, and minimal artifacts in one workflow run
   ```

4. Use:

   ```text
   artifact_profile: standard, airgap, minimal, or all
   source_ref: main or a version tag
   image_version: latest or a published container tag
   qemu_accelerator: tcg
   build_container_image: true
   pull_container_images: true
   ztf_framework_ref: v1.5.2
   bake_nkp_framework: true
   nkp_framework_ref: main
   nkp_bundle_urls: optional comma-separated bundle URLs
   ```

5. Download the artifact for the required profile:

   ```text
   ztf-orchestrator-ahv-qcow2-standard-<ref>
   ztf-orchestrator-ahv-qcow2-airgap-<ref>
   ztf-orchestrator-ahv-qcow2-minimal-<ref>
   ```

6. Verify `SHA256SUMS` before importing the image.

Tag builds also attach the QCOW2 and `SHA256SUMS` to the matching GitHub
Release. If the release does not exist, the workflow creates it.

### Build Locally

The Packer template in `packer/` creates an AHV-importable QCOW2. Build
requirements vary by workstation or CI runner:

- Packer with the QEMU plugin
- QEMU available on the build host
- an ISO creation tool for Packer cloud-init media (`xorriso` or `mkisofs`;
  `xorriso` is installed automatically by the GitHub Actions workflow)
- network access to Ubuntu cloud images, GitHub, the ZeroTouch Framework
  repository, and the NKP framework repository when NKP bake-in is enabled

Run:

```bash
cd appliance
VERSION=v1.3.0 \
ZTF_ORCHESTRATOR_VERSION=v1.3.0 \
ZTF_BUILD_CONTAINER_IMAGE=true \
ZTF_PULL_CONTAINER_IMAGES=true \
ZTF_FRAMEWORK_REF=v1.5.2 \
ZTF_BAKE_NKP_FRAMEWORK=true \
ZTF_NKP_FRAMEWORK_REF=main \
QEMU_ACCELERATOR=kvm \
scripts/build-ahv-qcow2.sh
```

Use `QEMU_ACCELERATOR=tcg` when KVM is not available. TCG is slower but works on
many hosted runners.

To include large local NKP bundles, copy them into this directory before running
Packer:

```text
appliance/preload/bundles/
```

To provide a reviewed local NKP framework checkout instead of cloning from Git,
copy it into:

```text
appliance/preload/nkp-zerotouch-framework/
```

To fetch NKP bundles from connected staging URLs during the build, set:

```bash
ZTF_NKP_BUNDLE_URLS="https://mirror.example/nkp-bundle.tar.gz,https://mirror.example/other-artifact.tgz"
```

The output is written to:

```text
appliance/packer/output/
```

### Import and Configure the Prebuilt QCOW2

Use this procedure after the **Build AHV Appliance Image** workflow has produced
one or more `ztf-orchestrator-ahv-qcow2-<profile>-<ref>` artifacts. Each
artifact contains an AHV-importable QCOW2 and a checksum file.

1. Download and extract the GitHub Actions artifact.

   Expected files:

   ```text
   ztf-orchestrator-appliance-<ref>.qcow2
   SHA256SUMS
   ```

2. Verify the checksum before transferring or importing the image.

   ```bash
   cd <artifact-directory>
   sha256sum -c SHA256SUMS
   ```

   On Windows PowerShell, use:

   ```powershell
   Get-FileHash .\ztf-orchestrator-appliance-<ref>.qcow2 -Algorithm SHA256
   Get-Content .\SHA256SUMS
   ```

3. Upload the `.qcow2` image in Prism Central or Prism Element.

   Use **Infrastructure > Compute & Storage > Images** or the equivalent
   **Image Configuration** page for your AOS/Prism version.

   Recommended image settings:

   ```text
   Image type: Disk
   Storage container: site-approved container
   Source: uploaded QCOW2
   ```

4. Create a VM from the uploaded image.

   Recommended starting size:

   ```text
   vCPU: 2
   RAM: 4-8 GB
   Disk: use the imported QCOW2 disk
   NIC: management VLAN or subnet
   Boot: imported disk first
   ```

   The management network must reach Prism Central, Prism Element/CVMs, DNS,
   NTP, IPAM, registry endpoints if used, and NKP deployment targets.

5. Add administrator access.

   The Packer build locks the temporary `ubuntu` build account before sealing
   the image. Use your AHV image process, cloud-init, guest customization, or
   break-glass console process to inject a site-approved administrator SSH key
   or account.

   A minimal cloud-init access payload looks like:

   ```yaml
   #cloud-config
   users:
     - name: ztfadmin
       groups: sudo
       shell: /bin/bash
       sudo: ALL=(ALL) NOPASSWD:ALL
       ssh_authorized_keys:
         - ssh-ed25519 <public-key> <owner>
   ssh_pwauth: false
   ```

6. Boot the VM and wait for first boot.

   From the VM console or SSH session:

   ```bash
   sudo systemctl status ztf-orchestrator-firstboot
   sudo systemctl status ztf-orchestrator
   cd /opt/ztf-orchestrator
   sudo docker compose -f appliance/docker-compose.appliance.yml ps
   ```

   First boot creates `/opt/ztf-orchestrator/.env`, generates the PostgreSQL
   password, installs/enables the runtime systemd service, and starts Docker
   Compose.

7. Retrieve the generated application admin password.

   ```bash
   sudo journalctl -u ztf-orchestrator -n 300 --no-pager
   ```

   If the password has scrolled out of the systemd view, inspect the container
   logs:

   ```bash
   cd /opt/ztf-orchestrator
   sudo docker compose -f appliance/docker-compose.appliance.yml logs ztf-orchestrator
   ```

8. Open the web UI.

   ```text
   http://<appliance-ip>:5001
   ```

   Sign in as `admin`, rotate credentials, create named users, and restrict
   access to the management network or a TLS reverse proxy.

9. Validate baked-in assets.

   ```bash
   cd /opt/ztf-orchestrator
   sudo docker image ls | grep ztf-orchestrator
   sudo docker image ls | grep postgres
   sudo docker compose -f appliance/docker-compose.appliance.yml exec ztf-orchestrator \
     ls -la /opt/zerotouch-framework
   sudo docker compose -f appliance/docker-compose.appliance.yml exec ztf-orchestrator \
     ls -la /var/lib/ztf-orchestrator/nkp-zerotouch-framework
   sudo docker compose -f appliance/docker-compose.appliance.yml exec ztf-orchestrator \
     ls -la /var/lib/ztf-orchestrator/bundles
   curl http://localhost:5001/health
   ```

10. Register NKP assets in the UI when using NKP workflows.

    In **NKP Framework > Binaries**, register server-visible paths such as:

    ```text
    /var/lib/ztf-orchestrator/nkp-zerotouch-framework
    /var/lib/ztf-orchestrator/bundles/<bundle-or-binary>
    ```

    Use the **Check CLI Compatibility** action after registering the framework
    or binary path.

11. Configure site integrations.

    In the UI, configure:

    ```text
    Global Config: Prism Central, Foundation Central, DNS/NTP/IPAM, registry
    Config Files: site YAML profiles and environment files
    Users: named operators and admin accounts
    Schedules/Approvals: maintenance windows and approval gates
    Validation Evidence: deployment evidence retention
    ```

12. Troubleshoot first boot if needed.

    ```bash
    sudo journalctl -u ztf-orchestrator-firstboot -n 300 --no-pager
    sudo journalctl -u ztf-orchestrator -n 300 --no-pager
    cd /opt/ztf-orchestrator
    sudo docker compose -f appliance/docker-compose.appliance.yml ps
    sudo docker compose -f appliance/docker-compose.appliance.yml logs --tail=200
    sudo ls -l /opt/ztf-orchestrator/.env
    sudo grep -E '^(ZTF_ORCHESTRATOR_VERSION|ZTF_HOST_BIND|ZTF_LOG_LEVEL)=' /opt/ztf-orchestrator/.env
    ```

    Keep `/opt/ztf-orchestrator/.env` local to the appliance. It contains the
    generated database password and must not be copied into Git.

### Offline or Restricted Sites

For disconnected sites, build the QCOW2 in a connected staging environment. The
default build creates the ZTF-Orchestrator image inside the QCOW2, so first boot
does not require GitHub Container Registry for the application image. The build
also attempts to preload the PostgreSQL image and stages the NKP framework when
`ZTF_BAKE_NKP_FRAMEWORK=true`. Transfer the QCOW2 and checksum into the
restricted site using the approved media process.

If the appliance must pull from an internal registry instead of using the baked
application image, set `ZTF_BUILD_CONTAINER_IMAGE=false`, mirror these images,
and set the appliance `.env` after first boot or before sealing your own image:

```text
ghcr.io/virtuarchitect/ztf-orchestrator:<tag>
postgres:16-alpine
```

For NKP air-gapped deployments, include the NKP framework and bundle artifacts
during the connected appliance build whenever possible. After deployment,
register these server-visible paths in the NKP Framework screen:

```text
/var/lib/ztf-orchestrator/nkp-zerotouch-framework
/var/lib/ztf-orchestrator/bundles/<bundle-or-binary>
```

## Packer Template Reference

The raw Packer commands are:

```bash
cd appliance/packer
packer init ahv-qcow2.pkr.hcl
packer build \
  -var "version=v1.3.0" \
  -var "ztf_orchestrator_version=v1.3.0" \
  -var "build_container_image=true" \
  -var "pull_container_images=true" \
  -var "ztf_framework_ref=v1.5.2" \
  -var "bake_nkp_framework=true" \
  -var "nkp_framework_ref=main" \
  -var "qemu_accelerator=kvm" \
  ahv-qcow2.pkr.hcl
```

Do not commit built VM images to Git. Attach the resulting QCOW2 to the matching
GitHub Release or store it in your internal artifact repository.

The Packer template installs Docker and a first-boot systemd unit, but it does
not start ZTF-Orchestrator during image build. Secrets are generated only after
the deployed VM boots for the first time.

When deploying a baked QCOW2, use cloud-init or your AHV image process to set a
real administrator SSH key or console password. The temporary Packer build
password is locked before the image shuts down.

## Operational Notes

- Keep the appliance on an internal management network.
- Use VM backup plus PostgreSQL logical backups.
- Do not expose port `5001` directly to untrusted networks.
- Prefer TLS via nginx or a load balancer for shared team access.
- Keep `.env` local to the appliance and never commit it.
