packer {
  required_plugins {
    qemu = {
      version = ">= 1.1.0"
      source  = "github.com/hashicorp/qemu"
    }
  }
}

variable "version" {
  type    = string
  default = "dev"
}

variable "appliance_profile" {
  type    = string
  default = "standard"
  validation {
    condition     = contains(["standard", "airgap", "minimal"], var.appliance_profile)
    error_message = "Use standard, airgap or minimal."
  }
}

variable "image_label" {
  type    = string
  default = "dev"
}

variable "ztf_orchestrator_version" {
  type    = string
  default = "auto"
}

variable "ztf_container_image" {
  type    = string
  default = "ghcr.io/virtuarchitect/ztf-orchestrator"
  validation {
    condition     = var.ztf_container_image == "ghcr.io/virtuarchitect/ztf-orchestrator"
    error_message = "Guided appliance updates require the standard Orchestrator repository."
  }
}

variable "postgres_image" {
  type    = string
  default = "postgres:16-alpine"
}

variable "build_container_image" {
  type    = bool
  default = true
}

variable "pull_container_images" {
  type    = bool
  default = true
}

variable "ztf_framework_repo_url" {
  type    = string
  default = "https://github.com/nutanixdev/zerotouch-framework.git"
}

variable "ztf_framework_ref" {
  type    = string
  default = "v1.5.2"
}

variable "bake_nkp_framework" {
  type    = bool
  default = true
}

variable "nkp_framework_repo_url" {
  type    = string
  default = "https://github.com/VirtuArchitect/nkp-zerotouch-framework.git"
}

variable "nkp_framework_ref" {
  type    = string
  default = "main"
}

variable "nkp_bundle_urls" {
  type    = string
  default = ""
}

variable "qemu_accelerator" {
  type    = string
  default = "tcg"
}

variable "qemu_binary" {
  type    = string
  default = "qemu-system-x86_64"
}

variable "packer_ssh_private_key_file" {
  type    = string
  default = ""
}

variable "packer_ssh_public_key" {
  type    = string
  default = ""
}

variable "ubuntu_cloud_image_url" {
  type    = string
  default = "https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img"
}

variable "ubuntu_cloud_image_checksum" {
  type    = string
  default = "file:https://cloud-images.ubuntu.com/noble/current/SHA256SUMS"
}

source "qemu" "ztf_orchestrator_ahv" {
  iso_url              = var.ubuntu_cloud_image_url
  iso_checksum         = var.ubuntu_cloud_image_checksum
  disk_image           = true
  format               = "qcow2"
  output_directory     = "output"
  vm_name              = "ztf-orchestrator-appliance-${var.image_label}.qcow2"
  headless             = true
  accelerator          = var.qemu_accelerator
  qemu_binary          = var.qemu_binary
  disk_size            = "81920M"
  memory               = 4096
  cpus                 = 2
  ssh_username         = "ubuntu"
  ssh_private_key_file = var.packer_ssh_private_key_file
  ssh_timeout          = "10m"
  shutdown_command     = "sudo shutdown -P now"
  cd_content = {
    "meta-data" = file("../cloud-init/meta-data")
    "user-data" = templatefile("../cloud-init/user-data.packer", {
      packer_ssh_public_key = var.packer_ssh_public_key
    })
  }
  cd_label = "cidata"
}

build {
  name    = "ztf-orchestrator-ahv-qcow2"
  sources = ["source.qemu.ztf_orchestrator_ahv"]

  provisioner "shell" {
    environment_vars = [
      "ZTF_ORCHESTRATOR_VERSION=${var.ztf_orchestrator_version}",
      "ZTF_SOURCE_REF=${var.version}",
      "ZTF_APPLIANCE_PROFILE=${var.appliance_profile}",
      "ZTF_CONTAINER_IMAGE=${var.ztf_container_image}",
      "ZTF_POSTGRES_IMAGE=${var.postgres_image}",
      "ZTF_BUILD_CONTAINER_IMAGE=${var.build_container_image}",
      "ZTF_PULL_CONTAINER_IMAGES=${var.pull_container_images}",
      "ZTF_FRAMEWORK_REPO_URL=${var.ztf_framework_repo_url}",
      "ZTF_FRAMEWORK_REF=${var.ztf_framework_ref}",
      "ZTF_BAKE_NKP_FRAMEWORK=${var.bake_nkp_framework}",
      "ZTF_NKP_FRAMEWORK_REPO_URL=${var.nkp_framework_repo_url}",
      "ZTF_NKP_FRAMEWORK_REF=${var.nkp_framework_ref}",
      "ZTF_NKP_BUNDLE_URLS=${var.nkp_bundle_urls}"
    ]
    inline = [
      "while sudo fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock >/dev/null 2>&1; do echo 'Waiting for apt locks...'; sleep 5; done",
      "sudo cloud-init status --wait || true",
      "while sudo fuser /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock >/dev/null 2>&1; do echo 'Waiting for apt locks...'; sleep 5; done",
      "sudo apt-get update",
      "sudo apt-get install -y git ca-certificates curl openssl python3",
      "sudo git clone --no-checkout https://github.com/VirtuArchitect/ZTF-Orchestrator.git /opt/ztf-orchestrator-source",
      "sudo git -C /opt/ztf-orchestrator-source fetch --depth=1 origin -- \"$ZTF_SOURCE_REF\"",
      "sudo git -C /opt/ztf-orchestrator-source checkout --detach FETCH_HEAD",
      "sudo bash /opt/ztf-orchestrator-source/appliance/scripts/install-docker.sh",
      "if [ \"$ZTF_BUILD_CONTAINER_IMAGE\" = \"true\" ]; then image_mode=--build; elif [ \"$ZTF_PULL_CONTAINER_IMAGES\" = \"true\" ]; then image_mode=--allow-pull; else image_mode=--defer; fi; sudo python3 /opt/ztf-orchestrator-source/appliance/image_identity.py --source /opt/ztf-orchestrator-source --version \"$ZTF_ORCHESTRATOR_VERSION\" $image_mode --framework-repo \"$ZTF_FRAMEWORK_REPO_URL\" --framework-ref \"$ZTF_FRAMEWORK_REF\" --manifest /etc/ztf-orchestrator-image.json",
      "if [ \"$ZTF_PULL_CONTAINER_IMAGES\" = \"true\" ]; then sudo docker image inspect \"$ZTF_POSTGRES_IMAGE\" >/dev/null 2>&1 || sudo docker pull \"$ZTF_POSTGRES_IMAGE\"; fi",
      "sudo python3 /opt/ztf-orchestrator-source/appliance/scripts/write-bootstrap-env.py --manifest /etc/ztf-orchestrator-image.json --profile \"$ZTF_APPLIANCE_PROFILE\" --output /etc/ztf-orchestrator-appliance.env",
      "sudo chmod 600 /etc/ztf-orchestrator-appliance.env",
      "sudo install -m 0644 /opt/ztf-orchestrator-source/appliance/systemd/ztf-orchestrator-firstboot.service /etc/systemd/system/ztf-orchestrator-firstboot.service",
      "sudo systemctl daemon-reload",
      "sudo systemctl enable ztf-orchestrator-firstboot.service",
      "sudo passwd -l ubuntu",
      "sudo rm -f /home/ubuntu/.ssh/authorized_keys",
      "sudo cloud-init clean --logs",
      "sudo rm -f /etc/ssh/ssh_host_*"
    ]
  }

  provisioner "file" {
    source      = "../preload/"
    destination = "/tmp/"
  }

  provisioner "shell" {
    environment_vars = [
      "ZTF_BAKE_NKP_FRAMEWORK=${var.bake_nkp_framework}",
      "ZTF_NKP_FRAMEWORK_REPO_URL=${var.nkp_framework_repo_url}",
      "ZTF_NKP_FRAMEWORK_REF=${var.nkp_framework_ref}",
      "ZTF_NKP_BUNDLE_URLS=${var.nkp_bundle_urls}"
    ]
    inline = [
      "sudo mkdir -p /opt/ztf-orchestrator-preload/nkp-zerotouch-framework /opt/ztf-orchestrator-preload/bundles",
      "if [ -d /tmp/preload/nkp-zerotouch-framework ] && [ \"$(find /tmp/preload/nkp-zerotouch-framework -mindepth 1 -maxdepth 1 2>/dev/null | head -n 1)\" ]; then sudo cp -a /tmp/preload/nkp-zerotouch-framework/. /opt/ztf-orchestrator-preload/nkp-zerotouch-framework/; fi",
      "if [ -d /tmp/preload/bundles ] && [ \"$(find /tmp/preload/bundles -mindepth 1 -maxdepth 1 2>/dev/null | head -n 1)\" ]; then sudo cp -a /tmp/preload/bundles/. /opt/ztf-orchestrator-preload/bundles/; fi",
      "sudo find /opt/ztf-orchestrator-preload -name .gitkeep -type f -delete",
      "if [ \"$ZTF_BAKE_NKP_FRAMEWORK\" = \"true\" ] && [ ! -f /opt/ztf-orchestrator-preload/nkp-zerotouch-framework/scripts/zt.sh ] && [ ! -f /opt/ztf-orchestrator-preload/nkp-zerotouch-framework/scripts/zt.ps1 ]; then sudo git clone --branch \"$ZTF_NKP_FRAMEWORK_REF\" \"$ZTF_NKP_FRAMEWORK_REPO_URL\" /opt/ztf-orchestrator-preload/nkp-zerotouch-framework || sudo git clone \"$ZTF_NKP_FRAMEWORK_REPO_URL\" /opt/ztf-orchestrator-preload/nkp-zerotouch-framework; sudo rm -rf /opt/ztf-orchestrator-preload/nkp-zerotouch-framework/.git; fi",
      "if [ -n \"$ZTF_NKP_BUNDLE_URLS\" ]; then printf '%s' \"$ZTF_NKP_BUNDLE_URLS\" | tr ',' '\\n' | while IFS= read -r url; do clean_url=\"$(printf '%s' \"$url\" | xargs)\"; [ -z \"$clean_url\" ] && continue; sudo sh -c 'cd /opt/ztf-orchestrator-preload/bundles && curl -fL --retry 3 --connect-timeout 20 -O \"$1\"' sh \"$clean_url\"; done; fi",
      "sudo chown -R root:root /opt/ztf-orchestrator-preload",
      "sudo chmod -R a+rX /opt/ztf-orchestrator-preload"
    ]
  }
}
