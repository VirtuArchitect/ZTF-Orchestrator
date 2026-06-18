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

variable "ztf_orchestrator_version" {
  type    = string
  default = "latest"
}

variable "ztf_container_image" {
  type    = string
  default = "ghcr.io/virtuarchitect/ztf-orchestrator"
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

variable "qemu_accelerator" {
  type    = string
  default = "tcg"
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
  iso_url           = var.ubuntu_cloud_image_url
  iso_checksum      = var.ubuntu_cloud_image_checksum
  disk_image        = true
  format            = "qcow2"
  output_directory  = "output"
  vm_name           = "ztf-orchestrator-appliance-${var.version}.qcow2"
  headless          = true
  accelerator       = var.qemu_accelerator
  disk_size         = "81920M"
  memory            = 4096
  cpus              = 2
  ssh_username      = "ubuntu"
  ssh_password      = "packer"
  ssh_timeout       = "10m"
  shutdown_command  = "sudo shutdown -P now"
  cd_files          = ["../cloud-init/meta-data", "../cloud-init/user-data.packer"]
  cd_label          = "cidata"
}

build {
  name    = "ztf-orchestrator-ahv-qcow2"
  sources = ["source.qemu.ztf_orchestrator_ahv"]

  provisioner "shell" {
    environment_vars = [
      "ZTF_ORCHESTRATOR_VERSION=${var.ztf_orchestrator_version}",
      "ZTF_SOURCE_REF=${var.version}",
      "ZTF_CONTAINER_IMAGE=${var.ztf_container_image}",
      "ZTF_POSTGRES_IMAGE=${var.postgres_image}",
      "ZTF_BUILD_CONTAINER_IMAGE=${var.build_container_image}",
      "ZTF_PULL_CONTAINER_IMAGES=${var.pull_container_images}",
      "ZTF_FRAMEWORK_REPO_URL=${var.ztf_framework_repo_url}",
      "ZTF_FRAMEWORK_REF=${var.ztf_framework_ref}"
    ]
    inline = [
      "sudo apt-get update",
      "sudo apt-get install -y git ca-certificates curl openssl",
      "sudo git clone --branch ${var.version} https://github.com/VirtuArchitect/ZTF-Orchestrator.git /opt/ztf-orchestrator-source || sudo git clone https://github.com/VirtuArchitect/ZTF-Orchestrator.git /opt/ztf-orchestrator-source",
      "sudo bash /opt/ztf-orchestrator-source/appliance/scripts/install-docker.sh",
      "if [ \"$ZTF_BUILD_CONTAINER_IMAGE\" = \"true\" ]; then sudo docker build --build-arg ZTF_REPO_URL=\"$ZTF_FRAMEWORK_REPO_URL\" --build-arg ZTF_REF=\"$ZTF_FRAMEWORK_REF\" -t \"$ZTF_CONTAINER_IMAGE:$ZTF_ORCHESTRATOR_VERSION\" /opt/ztf-orchestrator-source; elif [ \"$ZTF_PULL_CONTAINER_IMAGES\" = \"true\" ]; then sudo docker pull \"$ZTF_CONTAINER_IMAGE:$ZTF_ORCHESTRATOR_VERSION\" || true; fi",
      "if [ \"$ZTF_PULL_CONTAINER_IMAGES\" = \"true\" ]; then sudo docker pull \"$ZTF_POSTGRES_IMAGE\" || true; fi",
      "printf 'ZTF_SOURCE_REPO=https://github.com/VirtuArchitect/ZTF-Orchestrator.git\\nZTF_LOCAL_SOURCE_DIR=/opt/ztf-orchestrator-source\\nZTF_SOURCE_REF=${var.version}\\nZTF_ORCHESTRATOR_VERSION=${var.ztf_orchestrator_version}\\nZTF_HOST_BIND=0.0.0.0\\n' | sudo tee /etc/ztf-orchestrator-appliance.env >/dev/null",
      "sudo chmod 600 /etc/ztf-orchestrator-appliance.env",
      "sudo install -m 0644 /opt/ztf-orchestrator-source/appliance/systemd/ztf-orchestrator-firstboot.service /etc/systemd/system/ztf-orchestrator-firstboot.service",
      "sudo systemctl daemon-reload",
      "sudo systemctl enable ztf-orchestrator-firstboot.service",
      "sudo passwd -l ubuntu",
      "sudo cloud-init clean --logs",
      "sudo rm -f /etc/ssh/ssh_host_*"
    ]
  }
}
