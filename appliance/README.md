# ZTF-Orchestrator Appliance Kit

This directory contains the reproducible appliance assets for deploying
ZTF-Orchestrator as a small Linux VM on AHV or any other virtual platform.

Do not commit built VM images to Git. Publish large appliance outputs such as
QCOW2 files as GitHub Release artifacts.

## Recommended Distribution Model

1. Build and publish the application container to GitHub Container Registry.
2. Deploy a small Linux VM on AHV.
3. Run the first-boot script, or bake it into a QCOW2 image with Packer.
4. Store generated secrets only on the appliance VM.
5. Attach any generated QCOW2 image to a versioned GitHub Release.

## Contents

| Path | Purpose |
|---|---|
| `docker-compose.appliance.yml` | Runtime Compose file using the published GHCR image |
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
sudo ZTF_ORCHESTRATOR_VERSION=v1.2.9 \
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
ZTF-Orchestrator source tree, enables first-boot bootstrap, and attempts to
preload the ZTF-Orchestrator and PostgreSQL container images.

On first boot, the VM generates local secrets, creates `/opt/ztf-orchestrator`,
starts Docker Compose, and leaves the application admin password in the service
logs.

### Build from GitHub Actions

1. Open **Actions > Build AHV Appliance Image**.
2. Select **Run workflow**.
3. Use:

   ```text
   source_ref: main or a version tag
   image_version: latest or a published container tag
   qemu_accelerator: tcg
   ```

4. Download the artifact:

   ```text
   ztf-orchestrator-ahv-qcow2-<ref>
   ```

5. Verify `SHA256SUMS` before importing the image.

Tag builds also attach the QCOW2 and `SHA256SUMS` to the matching GitHub
Release. If the release does not exist, the workflow creates it.

### Build Locally

The Packer template in `packer/` creates an AHV-importable QCOW2. Build
requirements vary by workstation or CI runner:

- Packer with the QEMU plugin
- QEMU available on the build host
- network access to Ubuntu cloud images and GitHub/GHCR

Run:

```bash
cd appliance
VERSION=v1.2.9 \
ZTF_ORCHESTRATOR_VERSION=v1.2.9 \
QEMU_ACCELERATOR=kvm \
scripts/build-ahv-qcow2.sh
```

Use `QEMU_ACCELERATOR=tcg` when KVM is not available. TCG is slower but works on
many hosted runners.

The output is written to:

```text
appliance/packer/output/
```

### Import into Nutanix AHV

1. In Prism Central or Prism Element, upload the `.qcow2` image to Image
   Configuration.
2. Create a VM from the image with:

   ```text
   2 vCPU
   4-8 GB RAM
   80-100 GB disk
   Management network with access to Nutanix targets
   ```

3. Add a cloud-init user-data payload or use your image process to set an
   administrator SSH key or console login.
4. Boot the VM.
5. Wait for first boot to complete:

   ```bash
   sudo systemctl status ztf-orchestrator-firstboot
   sudo systemctl status ztf-orchestrator
   ```

6. Retrieve the app admin password:

   ```bash
   sudo journalctl -u ztf-orchestrator -n 200 --no-pager
   ```

7. Open:

   ```text
   http://<appliance-ip>:5001
   ```

8. Sign in as `admin`, rotate credentials, and configure users.

### Offline or Restricted Sites

For disconnected sites, build the QCOW2 in a connected staging environment where
the workflow can preload container images. Transfer the QCOW2 and checksum into
the restricted site using the approved media process.

If the appliance must pull from an internal registry, mirror these images and
set the appliance `.env` after first boot or before sealing your own image:

```text
ghcr.io/virtuarchitect/ztf-orchestrator:<tag>
postgres:16-alpine
```

## Packer Template Reference

The raw Packer commands are:

```bash
cd appliance/packer
packer init ahv-qcow2.pkr.hcl
packer build \
  -var "version=v1.2.9" \
  -var "ztf_orchestrator_version=v1.2.9" \
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
