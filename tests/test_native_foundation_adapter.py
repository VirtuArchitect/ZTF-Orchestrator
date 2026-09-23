import importlib.util
from pathlib import Path


def _load_adapter_module():
    path = Path(__file__).resolve().parents[1] / "scripts" / "native_foundation_ztf_site_deploy_adapter.py"
    spec = importlib.util.spec_from_file_location("native_foundation_ztf_site_deploy_adapter", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_build_site_deploy_config_maps_native_foundation_intent(monkeypatch):
    adapter = _load_adapter_module()
    monkeypatch.delenv("ZTF_NATIVE_FOUNDATION_FC_URL", raising=False)
    monkeypatch.setenv("ZTF_NATIVE_FOUNDATION_DOMAIN", "lab.example")

    native_intent = {
        "foundation_engine": {
            "image_repository": {
                "endpoint": "https://10.20.30.206:9440/fc/gui/",
                "credential_ref": "foundation_central",
            }
        },
        "sites": [
            {
                "site_name": "LAB_UAT",
                "hardware_provider": "dell_idrac_redfish",
                "network_profile": {
                    "bmc_subnet": "10.20.30.0/24",
                    "bmc_gateway": "10.20.30.1",
                    "host_subnet": "10.20.31.0/24",
                    "host_gateway": "10.20.31.1",
                    "management_vlan_id": 120,
                    "dns_servers": ["10.20.40.1"],
                    "ntp_servers": ["10.20.40.2"],
                },
                "clusters": [
                    {
                        "cluster_name": "LAB-UAT",
                        "deployment_type": "hci",
                        "hypervisor": "ahv",
                        "cluster_vip": "10.20.31.120",
                        "redundancy_factor": 2,
                        "timezone": "UTC",
                        "aos_image": {
                            "source": "http://repo/aos.tar.gz",
                            "version": "7.5.1.8",
                            "sha256": "a" * 64,
                        },
                        "hypervisor_image": {
                            "source": "http://repo/ahv.iso",
                            "version": "11.0.1.3",
                            "sha256": "b" * 64,
                        },
                        "nodes": [
                            {
                                "node_serial": "ABCDEF1",
                                "bmc_address": "10.20.30.50",
                                "host_ip": "10.20.31.80",
                                "cvm_ip": "10.20.31.81",
                                "hypervisor_hostname": "LAB-UAT-N01",
                                "cvm_ram_gb": 48,
                            },
                            {
                                "node_serial": "ABCDEF2",
                                "bmc_address": "10.20.30.52",
                                "host_ip": "10.20.31.82",
                                "cvm_ip": "10.20.31.83",
                                "hypervisor_hostname": "LAB-UAT-N02",
                                "cvm_ram_gb": 48,
                            },
                        ],
                    }
                ],
            }
        ],
    }

    config = adapter.build_site_deploy_config(native_intent)

    assert config["pc_ip"] == "10.20.30.206"
    assert config["pc_credential"] == "foundation_central"
    assert config["cvm_credential"] == "cvm_credential"
    site = config["sites"][0]
    assert site["site_name"] == "LAB_UAT"
    assert site["name_servers_list"] == ["10.20.40.1"]
    assert site["ntp_servers_list"] == ["10.20.40.2"]
    assert site["network"] == {
        "host_subnet": "10.20.31.0/24",
        "host_gateway": "10.20.31.1",
        "ipmi_subnet": "10.20.30.0/24",
        "ipmi_gateway": "10.20.30.1",
        "domain": "lab.example",
    }
    assert site["imaging_parameters"] == {
        "aos_url": "http://repo/aos.tar.gz",
        "hypervisor_type": "kvm",
        "hypervisor_url": "http://repo/ahv.iso",
    }
    cluster = site["clusters"][0]
    assert cluster["cluster_name"] == "LAB-UAT"
    assert cluster["cluster_size"] == 2
    assert cluster["cluster_vip"] == "10.20.31.120"
    assert cluster["cvm_ram"] == 48
    assert cluster["redundancy_factor"] == 2
    assert cluster["node_details"][0] == {
        "node_serial": "ABCDEF1",
        "cvm_ip": "10.20.31.81",
        "host_ip": "10.20.31.80",
        "ipmi_ip": "10.20.30.50",
        "hypervisor_hostname": "LAB-UAT-N01",
        "cvm_vlan_id": 120,
    }
