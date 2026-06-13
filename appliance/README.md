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
| `scripts/firstboot.sh` | Clones the repo, creates `.env`, installs systemd, and starts the appliance |
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

## Building a QCOW2

The Packer template in `packer/` is a reference starting point for creating an
AHV-importable QCOW2. Build requirements vary by workstation or CI runner:

- Packer with the QEMU plugin
- QEMU available on the build host
- network access to Ubuntu cloud images and GitHub/GHCR

Example:

```bash
cd appliance/packer
packer init ahv-qcow2.pkr.hcl
packer build \
  -var "version=v1.2.9" \
  -var "ztf_orchestrator_version=v1.2.9" \
  ahv-qcow2.pkr.hcl
```

Attach the resulting QCOW2 to the matching GitHub Release rather than storing it
inside the repository.

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
