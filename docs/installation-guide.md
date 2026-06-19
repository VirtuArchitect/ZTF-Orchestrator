# ZTF-Orchestrator Installation Guide

This guide expands the installation options from the main README into
step-by-step deployment procedures.

ZTF-Orchestrator currently targets the legacy ZeroTouch Framework 1.x
workflow/script CLI. Keep `ZTF_REF` pinned to `v1.5.2` unless you are
explicitly testing a reviewed compatibility change. ZeroTouch Framework 2.x uses
a different `ztf plan/apply` model and is detected as incompatible by the
current workflow UI.

## Installation Options

| Option | Best For | Storage | ZTF Location |
|---|---|---|---|
| One-command Linux/macOS | Quick host install | File backend | `$ZTF_INSTALL_DIR/zerotouch-framework` |
| One-command Windows | Quick workstation install | File backend | `%USERPROFILE%\ztf\zerotouch-framework` |
| Docker Compose | Recommended server install | PostgreSQL | `/opt/zerotouch-framework` inside the container |
| Docker Compose file backend | Local/simple Docker testing | File backend | `/opt/zerotouch-framework` inside the container |
| Appliance | VM/AHV deployment | PostgreSQL | `/opt/zerotouch-framework` inside the container |
| Manual | Development or custom layout | File backend by default | Configured by `ZTF_PATH` |
| Kubernetes | Starter cluster deployment | PostgreSQL | `/opt/zerotouch-framework` inside the container |
| Air-gapped | Disconnected environments | PostgreSQL or file | Prebuilt image or local clone |

## Common First-Login Flow

1. Start ZTF-Orchestrator.
2. Watch the terminal, Docker logs, or service journal for the first-run
   credential block.
3. Open the app in a browser.
4. Sign in as `admin` with the generated password.
5. Go to **Settings > Users** and create named admin/operator/viewer accounts.
6. Store the generated password securely or rotate it immediately.

If the first-run password is missed in a file-backed deployment, delete
`users.json` from `ZTF_DATA_DIR` and restart the app. For PostgreSQL-backed
deployments, reset the admin password from a trusted maintenance procedure
rather than deleting database data.

## Option A: One-Command Linux/macOS

Use this when you want a quick install directly on a Linux or macOS host.

### Prerequisites

1. Python 3.10 or newer.
2. `pip`.
3. `git`.
4. Network access to GitHub and PyPI, unless using internal mirrors.
5. Access from the host to the Nutanix systems that ZTF workflows will target.

### Install

1. Choose an install directory. The default is:

   ```bash
   ~/ztf
   ```

2. Run the installer:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/VirtuArchitect/ZTF-Orchestrator/main/install.sh | bash
   ```

3. For a custom port or install directory, run:

   ```bash
   ZTF_PORT=8080 ZTF_INSTALL_DIR=/opt/ztf ZTF_REF=v1.5.2 bash install.sh
   ```

4. Confirm the installer created:

   ```text
   <install-dir>/ZTF-Orchestrator
   <install-dir>/zerotouch-framework
   <install-dir>/venv
   ```

5. Open:

   ```text
   http://localhost:5001
   ```

   Use the custom port if you set `ZTF_PORT`.

### Restart Later

1. Activate the shared virtual environment:

   ```bash
   source ~/ztf/venv/bin/activate
   ```

2. Start the server:

   ```bash
   ZTF_PATH=~/ztf/zerotouch-framework \
   ZTF_PYTHON=~/ztf/venv/bin/python3 \
   python ~/ztf/ZTF-Orchestrator/server.py
   ```

### Validate

1. Open `/health`:

   ```bash
   curl http://localhost:5001/health
   ```

2. In the UI, open **Setup & Install** or **Settings** and confirm the framework
   path points to the local `zerotouch-framework` checkout.

## Option B: One-Command Windows PowerShell

Use this when running ZTF-Orchestrator locally on a Windows workstation.

### Prerequisites

1. Python 3.10 or newer on `PATH`.
2. `pip`.
3. Git for Windows on `PATH`.
4. PowerShell.
5. Network access to GitHub and PyPI, unless using internal mirrors.

### Install

1. Open PowerShell as your normal user.
2. Optional: avoid the common Hyper-V reserved range around port `5001`:

   ```powershell
   $env:ZTF_PORT = "8080"
   ```

3. Run:

   ```powershell
   iex ((New-Object Net.WebClient).DownloadString('https://raw.githubusercontent.com/VirtuArchitect/ZTF-Orchestrator/main/install.ps1'))
   ```

4. The installer creates:

   ```text
   %USERPROFILE%\ztf\ZTF-Orchestrator
   %USERPROFILE%\ztf\zerotouch-framework
   %USERPROFILE%\ztf\venv
   ```

5. Open:

   ```text
   http://localhost:5001
   ```

   Use the custom port if you set `ZTF_PORT`.

### Restart Later

1. Open PowerShell.
2. Activate the virtual environment:

   ```powershell
   & "$env:USERPROFILE\ztf\venv\Scripts\Activate.ps1"
   ```

3. Start the server:

   ```powershell
   $env:ZTF_PATH = "$env:USERPROFILE\ztf\zerotouch-framework"
   $env:ZTF_PYTHON = "$env:USERPROFILE\ztf\venv\Scripts\python.exe"
   python "$env:USERPROFILE\ztf\ZTF-Orchestrator\server.py"
   ```

### Validate

1. Open:

   ```text
   http://localhost:<port>/health
   ```

2. Confirm **Settings > ZTF Installation Path** points to:

   ```text
   C:\Users\<you>\ztf\zerotouch-framework
   ```

## Option C: Docker Compose with PostgreSQL

Use this for the recommended server deployment. The app container bakes in
ZeroTouch Framework at build time under `/opt/zerotouch-framework`.

### Prerequisites

1. Docker Engine or Docker Desktop.
2. Docker Compose plugin.
3. Network access to GitHub during image build, unless using an internal mirror.
4. Network access to Docker Hub for `postgres:16-alpine`, unless using an
   internal registry.

### Install

1. Clone the repository:

   ```bash
   git clone https://github.com/VirtuArchitect/ZTF-Orchestrator.git
   cd ZTF-Orchestrator
   ```

2. Create `.env`:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and set a unique password:

   ```text
   POSTGRES_PASSWORD=<unique-password>
   ZTF_DATABASE_URL=postgresql://ztf:<unique-password>@postgres:5432/ztf_orchestrator
   ZTF_REF=v1.5.2
   ```

4. Build and start:

   ```bash
   docker compose up -d --build
   ```

5. Watch logs and copy the first-run admin password:

   ```bash
   docker compose logs -f ztf-orchestrator
   ```

6. Open:

   ```text
   http://localhost:5001
   ```

### Validate

1. Check containers:

   ```bash
   docker compose ps
   ```

2. Check health:

   ```bash
   curl http://localhost:5001/health
   ```

3. Confirm the baked framework:

   ```bash
   docker exec -it ztf-orchestrator ls -la /opt/zerotouch-framework
   ```

4. Confirm persistent data volume:

   ```bash
   docker volume ls | grep ztf
   ```

### Stop and Restart

```bash
docker compose stop
docker compose start
```

To stop and remove containers while keeping volumes:

```bash
docker compose down
```

Do not remove volumes unless you intend to delete users, history, configs, and
database data.

## Option C2: Docker Compose File Backend

Use this for simple local Docker testing when PostgreSQL is not required.

### Install

1. Clone the repository:

   ```bash
   git clone https://github.com/VirtuArchitect/ZTF-Orchestrator.git
   cd ZTF-Orchestrator
   ```

2. Start the file-backed stack:

   ```bash
   ZTF_REF=v1.5.2 docker compose -f docker-compose.file.yml up -d --build
   ```

3. Read the generated admin password:

   ```bash
   docker compose -f docker-compose.file.yml logs -f ztf-orchestrator
   ```

4. Open:

   ```text
   http://localhost:5001
   ```

### Validate

```bash
docker compose -f docker-compose.file.yml ps
curl http://localhost:5001/health
docker exec -it ztf-orchestrator ls -la /opt/zerotouch-framework
```

## Option D: Appliance Deployment

Use this for a small Linux VM on AHV or another virtualization platform. The
appliance Compose file pulls the published container image and starts a local
PostgreSQL container.

For a pre-built AHV-importable QCOW2 workflow, see
[Appliance Kit](../appliance/README.md). The repository includes a
**Build AHV Appliance Image** GitHub Actions workflow and a local
`appliance/scripts/build-ahv-qcow2.sh` wrapper for Packer/QEMU builds.

### Prerequisites

1. Ubuntu Server 24.04 LTS or Rocky Linux 9 VM.
2. 2 vCPU, 4-8 GB RAM, and 80-100 GB disk.
3. Network access to GitHub and a container registry, unless using internal
   mirrors or a preloaded image.
4. Network access from the VM to Prism Central, Prism Element, Foundation
   Central, DNS, NTP, and other deployment services.
5. `sudo` access.

### Install on a Fresh VM

1. Install basic packages:

   ```bash
   sudo apt-get update
   sudo apt-get install -y git curl ca-certificates
   ```

2. Clone the source:

   ```bash
   git clone https://github.com/VirtuArchitect/ZTF-Orchestrator.git /opt/ztf-orchestrator-source
   ```

3. Run first boot:

   ```bash
   sudo bash /opt/ztf-orchestrator-source/appliance/scripts/firstboot.sh
   ```

4. To pin a released image:

   ```bash
   sudo ZTF_ORCHESTRATOR_VERSION=v1.3.0 \
     bash /opt/ztf-orchestrator-source/appliance/scripts/firstboot.sh
   ```

5. Open:

   ```text
   http://<vm-ip>:5001
   ```

### Validate

1. Check service status:

   ```bash
   sudo systemctl status ztf-orchestrator
   ```

2. Watch logs:

   ```bash
   sudo journalctl -u ztf-orchestrator -f
   ```

3. Check Compose:

   ```bash
   cd /opt/ztf-orchestrator
   sudo docker compose -f appliance/docker-compose.appliance.yml ps
   ```

4. Confirm health:

   ```bash
   curl http://localhost:5001/health
   ```

### TLS Recommendation

For shared team access, place nginx, a load balancer, or another TLS reverse
proxy in front of the appliance. Do not expose port `5001` directly to
untrusted networks.

### Pre-Built QCOW2 Summary

1. Run **Actions > Build AHV Appliance Image** in GitHub, or run the local
   Packer wrapper from a Linux build host.
   The default QCOW2 build locally builds the ZTF-Orchestrator container image
   inside the appliance and bakes ZeroTouch Framework `v1.5.2` into
   `/opt/zerotouch-framework` inside that container.
2. Download the `.qcow2` and checksum artifact from the workflow run. GitHub
   Releases publish checksum and manifest metadata only because QCOW2 files can
   exceed the GitHub Release 2 GiB per-file asset limit.
3. Upload the `.qcow2` into Prism Central or Prism Element image management.
4. Create a VM with 2 vCPU, 4-8 GB RAM, and 80-100 GB disk.
5. Attach a management VLAN and provide cloud-init or image-process credentials.
6. Boot the VM and wait for `ztf-orchestrator-firstboot` to complete.
7. Retrieve the generated admin password from:

   ```bash
   sudo journalctl -u ztf-orchestrator -n 200 --no-pager
   ```

## Option E: Manual Install

Use this for development, custom service managers, or environments where Docker
is not available.

### Prerequisites

1. Python 3.10 or newer.
2. `pip`.
3. Git.
4. A ZeroTouch Framework 1.x checkout, preferably `v1.5.2`.

### Install

1. Clone ZTF-Orchestrator:

   ```bash
   git clone https://github.com/VirtuArchitect/ZTF-Orchestrator.git
   cd ZTF-Orchestrator
   ```

2. Clone ZeroTouch Framework:

   ```bash
   git clone --depth 1 --branch v1.5.2 https://github.com/nutanixdev/zerotouch-framework.git ../zerotouch-framework
   ```

3. Create a virtual environment:

   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

   On Windows:

   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```

4. Install ZTF-Orchestrator dependencies:

   ```bash
   pip install -r requirements.txt
   ```

5. Install ZeroTouch Framework dependencies. The exact requirements file depends
   on the checked-out ZTF version:

   ```bash
   pip install -r ../zerotouch-framework/requirements/prod.txt
   ```

   If that file is not present, inspect the framework `requirements/` directory
   and install the appropriate requirements file for your workflow set.

6. Start the server:

   ```bash
   ZTF_PATH="$(pwd)/../zerotouch-framework" \
   ZTF_PYTHON="$(pwd)/venv/bin/python3" \
   python server.py
   ```

   On Windows:

   ```powershell
   $env:ZTF_PATH = (Resolve-Path ..\zerotouch-framework).Path
   $env:ZTF_PYTHON = (Resolve-Path .\venv\Scripts\python.exe).Path
   python server.py
   ```

7. Open:

   ```text
   http://localhost:5001
   ```

### Validate

```bash
curl http://localhost:5001/health
```

In the UI, confirm **Settings > ZTF Installation Path** points to the cloned
framework.

## Option F: Kubernetes Starter Manifests

Use this only as a starter deployment. Execution workers currently run inside
the Flask process, so the starter manifests intentionally use one replica.

### Prerequisites

1. A Kubernetes cluster.
2. A namespace where you can create Deployments, Services, Secrets, and PVCs.
3. A container image available to the cluster.
4. PostgreSQL from the included manifest or a managed PostgreSQL endpoint.

### Install

1. Build and publish an image accessible to the cluster, or use the published
   image if your cluster can reach it.
2. Edit `k8s/secret.example.yaml` and set production secrets.
3. Apply manifests:

   ```bash
   kubectl apply -f k8s/namespace.yaml
   kubectl apply -f k8s/secret.example.yaml
   kubectl apply -f k8s/configmap.yaml
   kubectl apply -f k8s/postgres.yaml
   kubectl apply -f k8s/deployment.yaml
   kubectl apply -f k8s/service.yaml
   ```

4. If using managed PostgreSQL, omit `postgres.yaml` and set
   `ZTF_DATABASE_URL` to the managed endpoint.

5. Expose the service through your preferred internal ingress or port-forward
   for testing:

   ```bash
   kubectl -n ztf-orchestrator port-forward svc/ztf-orchestrator 5001:5001
   ```

6. Open:

   ```text
   http://localhost:5001
   ```

### Validate

```bash
kubectl -n ztf-orchestrator get pods
kubectl -n ztf-orchestrator logs deploy/ztf-orchestrator
curl http://localhost:5001/health
```

## Air-Gapped Installation

Use this when the target site cannot reach GitHub, GHCR, Docker Hub, or PyPI.
The most reliable approach is to build and verify artifacts in a connected
staging environment, then transfer them into the disconnected site.

### Connected Staging Environment

1. Clone the repository:

   ```bash
   git clone https://github.com/VirtuArchitect/ZTF-Orchestrator.git
   cd ZTF-Orchestrator
   ```

2. Build the application image with ZTF `v1.5.2` baked in:

   ```bash
   docker build \
     --build-arg ZTF_REPO_URL=https://github.com/nutanixdev/zerotouch-framework.git \
     --build-arg ZTF_REF=v1.5.2 \
     -t ztf-orchestrator:airgap-v1.3.0 .
   ```

3. Pull the PostgreSQL image if using the PostgreSQL Compose deployment:

   ```bash
   docker pull postgres:16-alpine
   ```

4. Export images:

   ```bash
   docker save ztf-orchestrator:airgap-v1.3.0 -o ztf-orchestrator-airgap-v1.3.0.tar
   docker save postgres:16-alpine -o postgres-16-alpine.tar
   ```

5. Export the repository content needed for Compose files and docs:

   ```bash
   git archive --format=tar.gz --output ZTF-Orchestrator-source.tar.gz HEAD
   ```

6. If using NKP features, stage the NKP framework and NKP bundle separately.
   Large NKP bundles should be copied to persistent storage on the target VM and
   registered by path in **NKP Framework > Binaries**.

7. Transfer these files using your approved removable-media or artifact process:

   ```text
   ztf-orchestrator-airgap-v1.3.0.tar
   postgres-16-alpine.tar
   ZTF-Orchestrator-source.tar.gz
   NKP framework archive, if used
   NKP bundle/artifacts, if used
   ```

### Connected Staging for a Portable AHV Appliance

Use this path when the disconnected site should receive a ready-to-import QCOW2
rather than container tar files.

ZTF-Orchestrator v1.3.0 adds named AHV appliance artifact profiles. v1.2.x
remains the prior single-appliance workflow line.

1. Choose the QCOW2 build path.

   GitHub Actions inputs:

   ```text
   artifact_profile: standard, airgap, minimal, or all
   source_ref: main or a release tag
   image_version: latest or the release tag
   qemu_accelerator: tcg
   build_container_image: true
   pull_container_images: true
   ztf_framework_ref: v1.5.2
   bake_nkp_framework: true
   nkp_framework_ref: main
   nkp_bundle_urls: optional comma-separated bundle URLs
   ```

   Profiles:

   ```text
   standard: connected staging appliance with baked app, PostgreSQL, ZTF, and NKP framework
   airgap: portable disconnected-site appliance with baked app, PostgreSQL, ZTF, and NKP framework
   minimal: smaller bootstrap appliance; defers image pulls and NKP staging
   all: builds standard, airgap, and minimal artifacts in one workflow run
   ```

   The workflow installs QEMU plus `xorriso`; Packer uses `xorriso` to create
   the temporary cloud-init ISO attached during image customization.

2. Optional: include NKP bundle artifacts before a local build.

   Copy local files into:

   ```text
   appliance/preload/bundles/
   ```

   Or provide connected staging URLs:

   ```bash
   ZTF_NKP_BUNDLE_URLS="https://mirror.example/nkp-bundle.tar.gz"
   ```

   If you need to use a reviewed local NKP framework checkout instead of
   cloning from Git, copy it into:

   ```text
   appliance/preload/nkp-zerotouch-framework/
   ```

3. Build the QCOW2 from GitHub Actions or a connected Linux build host.

   A local Linux build host needs Packer, QEMU, and an ISO creation tool such
   as `xorriso` or `mkisofs`.

   Local Linux build host:

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

4. Verify the checksum:

   ```bash
   cd appliance/packer/output
   sha256sum -c SHA256SUMS
   ```

5. Transfer only the appliance artifacts required by the site:

   ```text
   ztf-orchestrator-appliance-<version>.qcow2
   SHA256SUMS
   ```

The appliance includes the ZTF-Orchestrator source checkout and a Docker image
with legacy ZeroTouch Framework baked into `/opt/zerotouch-framework` inside the
container. The first boot can therefore start without GitHub Container Registry
access for the application image. PostgreSQL is also preloaded when
`ZTF_PULL_CONTAINER_IMAGES=true` succeeds during the connected build. When
`ZTF_BAKE_NKP_FRAMEWORK=true`, the NKP framework is staged on the appliance host
and mounted into the container at:

```text
/var/lib/ztf-orchestrator/nkp-zerotouch-framework
```

Preloaded NKP bundles are mounted into:

```text
/var/lib/ztf-orchestrator/bundles
```

### Disconnected AHV Appliance Import

1. Download and extract the GitHub Actions artifact from the successful
   **Build AHV Appliance Image** run.

   The matching GitHub Release contains checksum files and an artifact manifest,
   but the QCOW2 images are downloaded from the Actions run artifacts because
   GitHub Release assets have a 2 GiB per-file limit.

   Artifact names include the selected appliance profile:

   ```text
   ztf-orchestrator-ahv-qcow2-standard-<ref>
   ztf-orchestrator-ahv-qcow2-airgap-<ref>
   ztf-orchestrator-ahv-qcow2-minimal-<ref>
   ```

   Expected files inside the artifact:

   ```text
   ztf-orchestrator-appliance-<profile>-<ref>.qcow2
   SHA256SUMS-<profile>-<ref>.txt
   ```

2. Verify the checksum.

   ```bash
   cd <artifact-directory>
   sha256sum -c SHA256SUMS-<profile>-<ref>.txt
   ```

3. Upload the QCOW2 into Prism Central or Prism Element image management.

   Use **Image Configuration** or **Infrastructure > Compute & Storage >
   Images**, depending on the Prism version.

   Recommended settings:

   ```text
   Image type: Disk
   Source: uploaded QCOW2
   Storage container: site-approved container
   ```

4. Create a VM from the image with 2 vCPU, 4-8 GB RAM, the imported QCOW2 disk,
   and the target management network.

5. Provide site-approved administrator access.

   The sealed image locks the temporary Packer `ubuntu` build account. Inject an
   administrator SSH key or account using cloud-init, AHV guest customization,
   or your image process.

   Minimal cloud-init example:

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

6. Boot the VM and wait for first boot:

   ```bash
   sudo systemctl status ztf-orchestrator-firstboot
   sudo systemctl status ztf-orchestrator
   cd /opt/ztf-orchestrator
   sudo docker compose -f appliance/docker-compose.appliance.yml ps
   ```

7. Retrieve the generated application admin password:

   ```bash
   sudo journalctl -u ztf-orchestrator -n 300 --no-pager
   ```

   If needed, inspect the container logs:

   ```bash
   cd /opt/ztf-orchestrator
   sudo docker compose -f appliance/docker-compose.appliance.yml logs ztf-orchestrator
   ```

8. Open the UI and complete initial configuration:

   ```text
   http://<appliance-ip>:5001
   ```

   Sign in as `admin`, rotate credentials, create named users, and restrict
   access to the management network or a TLS reverse proxy.

9. Validate the baked app image, ZTF framework, and NKP preload:

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

10. Confirm the NKP Framework UI can see the preloaded paths:

   ```text
   /var/lib/ztf-orchestrator/nkp-zerotouch-framework
   /var/lib/ztf-orchestrator/bundles/
   ```

11. In the UI, register the NKP framework path and any NKP binary or bundle
    paths under **NKP Framework > Binaries**. Use **Check CLI Compatibility**
    after registration.

12. Configure site integrations:

    ```text
    Global Config: Prism Central, Foundation Central, DNS/NTP/IPAM, registry
    Config Files: site YAML profiles and environment files
    Users: named operators and admin accounts
    Schedules/Approvals: maintenance windows and approval gates
    Validation Evidence: deployment evidence retention
    ```

13. Troubleshoot first boot if needed:

    ```bash
    sudo journalctl -u ztf-orchestrator-firstboot -n 300 --no-pager
    sudo journalctl -u ztf-orchestrator -n 300 --no-pager
    cd /opt/ztf-orchestrator
    sudo docker compose -f appliance/docker-compose.appliance.yml ps
    sudo docker compose -f appliance/docker-compose.appliance.yml logs --tail=200
    sudo ls -l /opt/ztf-orchestrator/.env
    sudo grep -E '^(ZTF_ORCHESTRATOR_VERSION|ZTF_HOST_BIND|ZTF_LOG_LEVEL)=' /opt/ztf-orchestrator/.env
    ```

    Keep `/opt/ztf-orchestrator/.env` local to the appliance because it contains
    the generated database password.

### Disconnected Target Environment

1. Install Docker Engine and the Compose plugin using your site-approved
   offline package process.

2. Load images:

   ```bash
   docker load -i ztf-orchestrator-airgap-v1.3.0.tar
   docker load -i postgres-16-alpine.tar
   ```

3. Extract the source archive:

   ```bash
   mkdir -p /opt/ztf-orchestrator
   tar -xzf ZTF-Orchestrator-source.tar.gz -C /opt/ztf-orchestrator
   cd /opt/ztf-orchestrator
   ```

4. Create `.env`:

   ```bash
   cp .env.example .env
   ```

5. Edit `.env`:

   ```text
   POSTGRES_PASSWORD=<unique-password>
   ZTF_DATABASE_URL=postgresql://ztf:<unique-password>@postgres:5432/ztf_orchestrator
   ZTF_REF=v1.5.2
   ```

6. Update `docker-compose.yml` to use the loaded image tag, or retag the loaded
   image as the Compose default:

   ```bash
   docker tag ztf-orchestrator:airgap-v1.3.0 ztf-orchestrator:latest
   ```

7. Start:

   ```bash
   docker compose up -d
   ```

8. Check logs:

   ```bash
   docker compose logs -f ztf-orchestrator
   ```

9. Validate the baked framework:

   ```bash
   docker exec -it ztf-orchestrator ls -la /opt/zerotouch-framework
   curl http://localhost:5001/health
   ```

10. Open:

    ```text
    http://<host-ip>:5001
    ```

### Air-Gapped Internal Mirrors

If your disconnected environment has internal mirrors rather than no network at
all, use these settings:

```text
ZTF_REPO_URL=<internal Git mirror for zerotouch-framework>
ZTF_REF=v1.5.2
```

For manual installs, use a local PyPI mirror or pre-downloaded wheelhouse:

```bash
pip install --no-index --find-links /path/to/wheelhouse -r requirements.txt
```

For the in-app Setup page, use an internal Git mirror URL. The backend allowlist
for install sources must include that mirror before operators can clone from it.

### Air-Gapped NKP Notes

1. Stage the NKP framework under a persistent path such as:

   ```text
   /var/lib/ztf-orchestrator/nkp-zerotouch-framework
   ```

2. Set **Settings > NKP Framework Path** or `ZTF_NKP_PATH` to that path.
3. Stage the NKP CLI/bundle on the VM or inside a mounted persistent volume.
4. In **NKP Framework > Binaries**, register the server-visible path.
5. Run **Check CLI Compatibility** before generating or submitting NKP phases.

## Post-Install Hardening Checklist

1. Create named admin/operator/viewer users and rotate the initial admin
   password.
2. Keep the app on an internal management network.
3. Put nginx or another TLS reverse proxy in front for team access.
4. Restrict access to admins and operators who are authorized to run Nutanix
   workflows.
5. Configure `ZTF_DATA_DIR` backups or PostgreSQL backups.
6. Validate `/health`.
7. Confirm `ZTF_PATH` points to a ZeroTouch Framework 1.x checkout.
8. Run a non-production smoke workflow before using live Nutanix targets.
9. Record the deployment version, ZTF ref, storage backend, and backup plan.
