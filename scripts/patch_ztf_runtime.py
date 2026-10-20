import os
from pathlib import Path


RUNTIME_ROOT = Path(os.environ.get("ZTF_RUNTIME_ROOT", "/opt/zerotouch-framework"))


def _runtime_path(relative_path: str) -> Path:
    return RUNTIME_ROOT / relative_path


def _replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    if new in text:
        print(f"Patch already present in {path}")
        return
    if old not in text:
        raise SystemExit(f"Expected {label} block not found in {path}")
    path.write_text(text.replace(old, new))
    print(f"Patched {path}")


def patch_pc_entity_list() -> None:
    path = _runtime_path("framework/scripts/python/helpers/pc_entity_v3.py")
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
    _replace_once(path, old, new, "PcEntity.list")


def patch_pc_vm_payload_name() -> None:
    path = _runtime_path("framework/scripts/python/helpers/v3/vm.py")
    old = """        cluster_name = kwargs["cluster_name"]
        payload = self.get_pc_vm_payload()
"""
    new = """        cluster_name = kwargs["cluster_name"]
        payload = self.get_pc_vm_payload()
        payload["spec"]["name"] = kwargs["name"]
"""
    _replace_once(path, old, new, "VM payload")


def patch_deploy_pc_cvm_credential_fallback() -> None:
    path = _runtime_path("framework/scripts/python/pe/deploy_pc.py")
    old = """                        cvm_credential = cluster_details.get("cvm_credential")
"""
    new = """                        cvm_credential = cluster_details.get("cvm_credential") or self.data.get("cvm_credential")
"""
    _replace_once(path, old, new, "DeployPC CVM credential")


def patch_cvm_pc_metadata_download_check() -> None:
    for path in [
        _runtime_path("framework/scripts/python/helpers/cvm/ssh_cvm.py"),
        _runtime_path("framework/scripts/python/helpers/ssh_cvm.py"),
    ]:
        text = path.read_text()
        old = "if not self.file_exists(file_path) and not self.file_exists(metadata_file_url):"
        new = "if not self.file_exists(file_path) or not self.file_exists(metadata_file_path):"
        if new in text:
            print(f"Patch already present in {path}")
            continue
        if old not in text:
            raise SystemExit(f"Expected metadata download check block not found in {path}")
        path.write_text(text.replace(old, new))
        print(f"Patched {path}")


def patch_windows_log_cleanup() -> None:
    path = _runtime_path("framework/helpers/general_utils.py")
    old = """def delete_file_util(file_path: str) -> None:
    \"\"\"
    Function to delete a file if it exists.

    Args:
        file_path (str): Path to the file to delete.
    \"\"\"
    if os.path.exists(file_path):
        os.remove(file_path)
"""
    new = """def delete_file_util(file_path: str) -> None:
    \"\"\"
    Function to delete a file if it exists.

    Args:
        file_path (str): Path to the file to delete.
    \"\"\"
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except PermissionError:
            logger.warning(f\"Skipping deletion of active or locked file {file_path!r}\")
"""
    _replace_once(path, old, new, "Windows-safe log cleanup")


def patch_pc_config_preserves_sessions() -> None:
    path = _runtime_path("framework/scripts/python/pc/configure_pc.py")
    old = """        self.data = deepcopy(data)
        self.global_data = deepcopy(global_data) if global_data else {}
"""
    new = """        self.data = data
        self.global_data = global_data or {}
"""
    _replace_once(path, old, new, "PcConfig session preservation")


def patch_pc_v4_batch_retry() -> None:
    path = _runtime_path("framework/scripts/python/helpers/pc_batch_op_v4.py")
    text = path.read_text()
    if "def _submit_batch_with_retry" in text:
        print(f"Patch already present in {path}")
        return
    text = text.replace(
        "import uuid\n",
        "import time\nimport uuid\n",
    )
    helper = """

def _submit_batch_with_retry(batch_api, batch_spec, attempts: int = 3):
    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            return batch_api.submit_batch(async_req=False, body=batch_spec)
        except Exception as exc:
            last_error = exc
            message = str(exc)
            retryable = (
                "503" in message
                or "SERVICE UNAVAILABLE" in message
                or "upstream connect error" in message
                or "connection failure" in message
                or "reset before headers" in message
            )
            if not retryable or attempt == attempts:
                raise
            delay = min(2 ** attempt, 10)
            logger.warning(
                f"Retryable Prism Central v4 batch failure on attempt {attempt}/{attempts}: {exc}. "
                f"Retrying in {delay}s"
            )
            time.sleep(delay)
    raise last_error
"""
    anchor = "\n\ndef get_task_uuid_list(api_response_list: List) -> List:\n"
    if anchor not in text:
        raise SystemExit(f"Expected batch task helper anchor not found in {path}")
    text = text.replace(anchor, helper + anchor)
    text = text.replace(
        """        api_response_list = self.batch_api.submit_batch(
                async_req=False, body=batch_spec
            )
""",
        """        api_response_list = _submit_batch_with_retry(self.batch_api, batch_spec)
""",
    )
    path.write_text(text)
    print(f"Patched {path}")


def patch_pe_role_mapping_optional_directory() -> None:
    path = _runtime_path("framework/scripts/python/pe/create/create_rolemapping_pe.py")
    _replace_once(
        path,
        '        authn_payload = cluster_details.get("directory_services")\n',
        '        authn_payload = cluster_details.get("directory_services") or {}\n',
        "optional PE directory services",
    )
    _replace_once(
        path,
        """f"'{cluster_ip}/ {cluster_details['cluster_info']['name']}'")""",
        """f"'{cluster_info}'")""",
        "optional PE cluster name in directory warning",
    )


def patch_register_to_pc_verification() -> None:
    path = _runtime_path("framework/scripts/python/pe/other_ops/register_pe_to_pc.py")
    helper = Path(__file__).with_name("ztf_verification_errors.py")
    _runtime_path("framework/helpers/verification_errors.py").write_text(
        helper.read_text(encoding="utf-8"), encoding="utf-8",
    )
    old = '''        except Exception as e:
            self.logger.debug(e)
            self.logger.info(f"Exception occurred during the verification of {type(self).__name__!r} "
                             f"for {cluster_ip}")
'''
    new = '''        except Exception as e:
            from framework.helpers.verification_errors import verification_error_detail
            detail = verification_error_detail(e, self.data, (self.pc_password,))
            self.logger.error(
                "RegisterToPc verification failed for %s: %s", cluster_ip, detail
            )
'''
    _replace_once(path, old, new, "RegisterToPc verification error")


def patch_pe_local_users() -> None:
    source = Path(__file__).resolve().parent
    core = source / 'pe_local_users.py'
    if not core.exists():
        core = source.parent / 'pe_local_users.py'
    _runtime_path('framework/helpers/pe_local_users.py').write_text(core.read_text(encoding='utf-8'), encoding='utf-8')
    _runtime_path('framework/scripts/python/pe/create/create_local_users_pe.py').write_text(
        (source / 'ztf_create_local_users_pe.py').read_text(encoding='utf-8'), encoding='utf-8',
    )
    registry = _runtime_path('framework/scripts/python/__init__.py')
    text = registry.read_text()
    if 'from .pe.create.create_local_users_pe import CreateLocalUsersPe' not in text:
        registry.write_text(text + '\nfrom .pe.create.create_local_users_pe import CreateLocalUsersPe\n__all__.append("CreateLocalUsersPe")\n')
    _replace_once(
        _runtime_path('main.py'),
        '            pre_run_actions += [create_pe_objects, create_pc_objects, create_ipam_object]\n',
        '            if input_scripts != [CreateLocalUsersPe]:\n'
        '                pre_run_actions += [create_pe_objects, create_pc_objects, create_ipam_object]\n',
        'PE local-user verified transport',
    )


def main() -> None:
    patch_pc_entity_list()
    patch_pc_vm_payload_name()
    patch_deploy_pc_cvm_credential_fallback()
    patch_cvm_pc_metadata_download_check()
    patch_windows_log_cleanup()
    patch_pc_config_preserves_sessions()
    patch_pc_v4_batch_retry()
    patch_pe_role_mapping_optional_directory()
    patch_register_to_pc_verification()
    patch_pe_local_users()


if __name__ == "__main__":
    main()
