#!/usr/bin/env python3
"""Native Foundation adapter backed by bundled ZTF 1.x Foundation Central workflows."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

import yaml


def _load_yaml(path: Path) -> dict:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a YAML mapping")
    return data


def _host_from_endpoint(endpoint: str) -> str:
    value = str(endpoint or "").strip()
    if not value:
        return ""
    parsed = urlparse(value if "://" in value else f"https://{value}")
    return parsed.hostname or parsed.netloc or parsed.path


def _network_from_site(site: dict) -> dict:
    profile = site.get("network_profile") if isinstance(site.get("network_profile"), dict) else {}
    network: dict = {}
    if profile.get("host_subnet"):
        network["host_subnet"] = profile["host_subnet"]
    if profile.get("host_gateway"):
        network["host_gateway"] = profile["host_gateway"]
    if profile.get("bmc_subnet"):
        network["ipmi_subnet"] = profile["bmc_subnet"]
    if profile.get("bmc_gateway"):
        network["ipmi_gateway"] = profile["bmc_gateway"]
    if os.environ.get("ZTF_NATIVE_FOUNDATION_DOMAIN"):
        network["domain"] = os.environ["ZTF_NATIVE_FOUNDATION_DOMAIN"]
    return network


def build_site_deploy_config(intent: dict) -> dict:
    engine = intent.get("foundation_engine") if isinstance(intent.get("foundation_engine"), dict) else {}
    image_repo = engine.get("image_repository") if isinstance(engine.get("image_repository"), dict) else {}
    fc_endpoint = os.environ.get("ZTF_NATIVE_FOUNDATION_FC_URL") or str(image_repo.get("endpoint") or "")
    pc_ip = _host_from_endpoint(fc_endpoint)
    if not pc_ip:
        raise ValueError("Foundation Central endpoint is required in foundation_engine.image_repository.endpoint or ZTF_NATIVE_FOUNDATION_FC_URL")

    pc_credential = (
        os.environ.get("ZTF_NATIVE_FOUNDATION_FC_CREDENTIAL_REF")
        or str(image_repo.get("credential_ref") or "")
        or "foundation_central"
    )
    cvm_credential = os.environ.get("ZTF_NATIVE_FOUNDATION_CVM_CREDENTIAL_REF") or "cvm_credential"

    output = {
        "pc_ip": pc_ip,
        "pc_credential": pc_credential,
        "cvm_credential": cvm_credential,
        "sites": [],
    }

    for site_index, site in enumerate(intent.get("sites") or [], start=1):
        if not isinstance(site, dict):
            continue
        network_profile = site.get("network_profile") if isinstance(site.get("network_profile"), dict) else {}
        site_entry = {
            "site_name": site.get("site_name") or site.get("name") or f"site-{site_index}",
            "name_servers_list": network_profile.get("dns_servers") or [],
            "ntp_servers_list": network_profile.get("ntp_servers") or [],
            "use_existing_network_settings": False,
            "re-image": True,
            "network": _network_from_site(site),
            "clusters": [],
        }

        clusters = site.get("clusters") if isinstance(site.get("clusters"), list) else []
        first_cluster = clusters[0] if clusters and isinstance(clusters[0], dict) else {}
        aos_image = first_cluster.get("aos_image") if isinstance(first_cluster.get("aos_image"), dict) else {}
        hypervisor_image = first_cluster.get("hypervisor_image") if isinstance(first_cluster.get("hypervisor_image"), dict) else {}
        site_entry["imaging_parameters"] = {
            "aos_url": aos_image.get("source") or "",
            "hypervisor_type": "kvm" if str(first_cluster.get("hypervisor") or "ahv").lower() == "ahv" else str(first_cluster.get("hypervisor") or ""),
            "hypervisor_url": hypervisor_image.get("source") or "",
        }

        for cluster_index, cluster in enumerate(clusters, start=1):
            if not isinstance(cluster, dict):
                continue
            nodes = cluster.get("nodes") if isinstance(cluster.get("nodes"), list) else []
            cluster_entry = {
                "cluster_name": cluster.get("cluster_name") or cluster.get("name") or f"cluster-{cluster_index}",
                "cluster_size": len(nodes),
                "cluster_vip": cluster.get("cluster_vip") or "",
                "cvm_ram": max([int(node.get("cvm_ram_gb") or 12) for node in nodes if isinstance(node, dict)] or [12]),
                "node_details": [],
                "redundancy_factor": int(cluster.get("redundancy_factor") or 2),
                "timezone": cluster.get("timezone") or site.get("timezone") or "UTC",
            }
            vlan_id = network_profile.get("management_vlan_id")
            for node in nodes:
                if not isinstance(node, dict):
                    continue
                node_entry = {
                    "node_serial": node.get("node_serial") or node.get("serial") or "",
                    "cvm_ip": node.get("cvm_ip") or "",
                    "host_ip": node.get("host_ip") or "",
                    "ipmi_ip": node.get("bmc_address") or "",
                    "hypervisor_hostname": node.get("hypervisor_hostname") or "",
                }
                if vlan_id not in (None, ""):
                    node_entry["cvm_vlan_id"] = vlan_id
                cluster_entry["node_details"].append(node_entry)
            site_entry["clusters"].append(cluster_entry)

        output["sites"].append(site_entry)

    if not output["sites"]:
        raise ValueError("At least one native Foundation site is required")
    return output


def main() -> int:
    intent_path = Path(os.environ.get("ZTF_NATIVE_FOUNDATION_INTENT_FILE") or "")
    evidence_dir = Path(os.environ.get("ZTF_NATIVE_FOUNDATION_EVIDENCE_DIR") or os.getcwd())
    evidence_dir.mkdir(parents=True, exist_ok=True)
    if not intent_path.exists():
        print(f"Native Foundation intent file was not found: {intent_path}", file=sys.stderr)
        return 2

    intent = _load_yaml(intent_path)
    site_deploy = build_site_deploy_config(intent)
    generated_config = evidence_dir / "ztf-site-deploy.yml"
    generated_config.write_text(yaml.safe_dump(site_deploy, sort_keys=False), encoding="utf-8")

    ztf_root = Path(os.environ.get("ZTF_PATH") or "/opt/zerotouch-framework")
    ztf_python = Path(os.environ.get("ZTF_PYTHON") or "/opt/ztf-python/bin/python")
    command = [
        str(ztf_python),
        str(ztf_root / "main.py"),
        "--workflow",
        "site-deploy",
        "-f",
        str(generated_config),
    ]
    if os.environ.get("ZTF_NATIVE_FOUNDATION_DEBUG_ADAPTER"):
        command.append("--debug")

    manifest_path = evidence_dir / "ztf-site-deploy-adapter.json"
    manifest_path.write_text(
        json.dumps(
            {
                "adapter": "ztf-site-deploy",
                "command": command,
                "generatedConfig": str(generated_config),
                "pcIp": site_deploy["pc_ip"],
                "siteCount": len(site_deploy["sites"]),
                "clusterCount": sum(len(site.get("clusters") or []) for site in site_deploy["sites"]),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"Generated ZTF site-deploy config: {generated_config}")
    print(f"Invoking bundled ZTF Foundation Central workflow: {' '.join(command)}")
    completed = subprocess.run(command, cwd=str(ztf_root), text=True, check=False)
    return int(completed.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
