from pathlib import Path


def patch_pc_entity_list() -> None:
    path = Path("/opt/zerotouch-framework/framework/scripts/python/helpers/pc_entity_v3.py")
    text = path.read_text()
    old = """        if kwargs.pop("sort_order", None):
            payload["sort_order"] = kwargs.pop("sort_order")
        if kwargs.pop("sort_attribute", None):
            payload["sort_attribute"] = kwargs.pop("sort_attribute")
        if kwargs.pop("filter", None):
            payload["filter"] = kwargs.pop("filter")
"""
    new = """        sort_order = kwargs.pop("sort_order", None)
        if sort_order:
            payload["sort_order"] = sort_order
        sort_attribute = kwargs.pop("sort_attribute", None)
        if sort_attribute:
            payload["sort_attribute"] = sort_attribute
        filter_criteria = kwargs.pop("filter", None)
        if filter_criteria:
            payload["filter"] = filter_criteria
"""
    if old not in text:
        raise SystemExit(f"Expected PcEntity.list block not found in {path}")
    path.write_text(text.replace(old, new))
    print(f"Patched {path}")


def patch_pc_vm_payload_name() -> None:
    path = Path("/opt/zerotouch-framework/framework/scripts/python/helpers/v3/vm.py")
    text = path.read_text()
    old = """        cluster_name = kwargs["cluster_name"]
        payload = self.get_pc_vm_payload()
"""
    new = """        cluster_name = kwargs["cluster_name"]
        payload = self.get_pc_vm_payload()
        payload["spec"]["name"] = kwargs["name"]
"""
    if old not in text:
        raise SystemExit(f"Expected VM payload block not found in {path}")
    path.write_text(text.replace(old, new))
    print(f"Patched {path}")


patch_pc_entity_list()
patch_pc_vm_payload_name()
