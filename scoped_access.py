"""Deny-default operational access. Business records and existing approvals are not migrated."""

from datetime import datetime, timezone
import hashlib
import json
import re
import threading
import uuid
from flask import Response, g, jsonify, request, stream_with_context
import yaml
import pe_direct
import yaml_studio_ops

LOCK = threading.RLock()
CAPABILITIES = {
    "pipeline.execute",
    "requests.create",
    "drafts.create",
    "jobs.cancel_own",
}
ACTIONS = {
    "config-cluster",
    "ChangeDefaultAdminPasswordPe",
    "CreateLocalUsersPe",
    "SetPrismLoginTitlePe",
}
REF = re.compile(r"[A-Za-z0-9_.-]{1,128}")
ID = re.compile(r"[A-Za-z0-9_-]{1,80}")
PUBLIC_AUTH = {
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/me",
    "/api/auth/activity",
}


class AccessError(ValueError):
    def __init__(self, message, status=403):
        super().__init__(message)
        self.status = status


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(value):
    raw = (
        value
        if isinstance(value, str)
        else json.dumps(value, sort_keys=True, separators=(",", ":"))
    )
    return hashlib.sha256(raw.encode()).hexdigest()


def text(value, limit=120):
    if (
        not isinstance(value, str)
        or not value.strip()
        or len(value) > limit
        or any(ord(c) < 32 for c in value)
    ):
        raise AccessError("Invalid access metadata.", 400)
    return value.strip()


def string_list(value, permitted):
    return (
        isinstance(value, list)
        and len(value) <= 500
        and all(isinstance(item, str) for item in value)
        and len(set(value)) == len(value)
        and set(value) <= permitted
    )


def empty_policy():
    return {
        "version": 1,
        "revision": 0,
        "scopes": [],
        "assignments": {},
        "bindings": [],
    }


def validate_policy(value):
    if not isinstance(value, dict) or set(value) != set(empty_policy()):
        raise AccessError("Invalid access policy document.", 400)
    if (
        type(value["version"]) is not int
        or value["version"] != 1
        or type(value["revision"]) is not int
        or value["revision"] < 0
    ):
        raise AccessError("Invalid access policy version.", 400)
    if (
        not isinstance(value["scopes"], list)
        or len(value["scopes"]) > 500
        or not isinstance(value["assignments"], dict)
        or len(value["assignments"]) > 2000
        or not isinstance(value["bindings"], list)
        or len(value["bindings"]) > 2000
    ):
        raise AccessError("Invalid access policy size.", 400)
    ids, addresses = set(), set()
    for scope in value["scopes"]:
        if not isinstance(scope, dict) or set(scope) != {
            "id",
            "name",
            "datacenter",
            "connection",
            "credentialRefs",
            "pcIp",
        }:
            raise AccessError(
                "Provide an exact cluster scope and credential-reference allowlist.",
                400,
            )
        identity = text(scope["id"], 80)
        if not ID.fullmatch(identity) or identity in ids:
            raise AccessError("Scope IDs must be unique.", 400)
        ids.add(identity)
        text(scope["name"])
        text(scope["datacenter"])
        try:
            scope["connection"] = pe_direct.connection(scope["connection"])
            from urllib.parse import urlparse

            address = pe_direct.host_ip(
                urlparse(scope["connection"]["pe_endpoint"]).hostname
            )
        except (ValueError, TypeError):
            raise AccessError(
                "Scope needs a literal PE IPv4 endpoint, expected UUID and explicit TLS policy.",
                400,
            ) from None
        if address in addresses:
            raise AccessError("Each PE endpoint must belong to one scope.", 400)
        addresses.add(address)
        refs = scope["credentialRefs"]
        if (
            not isinstance(refs, list)
            or not refs
            or len(refs) > 100
            or any(not isinstance(ref, str) or not REF.fullmatch(ref) for ref in refs)
            or len(set(refs)) != len(refs)
            or scope["connection"]["pe_credential"] not in refs
        ):
            raise AccessError(
                "Scope credential references must be explicit and include its PE reference.",
                400,
            )
        if scope["pcIp"]:
            try:
                pe_direct.host_ip(scope["pcIp"])
            except ValueError:
                raise AccessError(
                    "Use a literal permitted PC IPv4 address.", 400
                ) from None
    for account_id, item in value["assignments"].items():
        if (
            not isinstance(account_id, str)
            or not ID.fullmatch(account_id)
            or not isinstance(item, dict)
            or set(item) != {"scopeIds", "capabilities"}
        ):
            raise AccessError("Invalid account assignment.", 400)
        if not string_list(item["scopeIds"], ids) or not string_list(
            item["capabilities"], CAPABILITIES
        ):
            raise AccessError("Unknown scope or capability.", 400)
    binding_ids = set()
    for binding in value["bindings"]:
        if not isinstance(binding, dict) or set(binding) != {
            "id",
            "accountId",
            "pipelineId",
            "scopeIds",
            "fingerprint",
            "approvedBy",
            "approvedAt",
        }:
            raise AccessError("Invalid reviewed pipeline binding.", 400)
        if (
            not ID.fullmatch(text(binding["id"], 80))
            or not ID.fullmatch(text(binding["accountId"], 80))
            or not string_list(binding["scopeIds"], ids)
            or not binding["scopeIds"]
            or not isinstance(binding["fingerprint"], str)
            or not re.fullmatch("[a-f0-9]{64}", binding["fingerprint"])
        ):
            raise AccessError("Invalid binding identity.", 400)
        if binding["id"] in binding_ids:
            raise AccessError("Duplicate binding identity.", 400)
        binding_ids.add(binding["id"])
        text(binding["pipelineId"])
        text(binding["approvedBy"])
        text(binding["approvedAt"])
    return value


def reference_only(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if not isinstance(key, str):
                raise AccessError("Configuration keys must be strings.", 409)
            low = key.lower()
            if any(
                term in low
                for term in ("password", "secret", "token", "private_key", "vault")
            ):
                raise AccessError(
                    "Delegated configurations must contain references, not secrets or vault overrides.",
                    409,
                )
            if "credential" in low and (
                not isinstance(child, str) or not REF.fullmatch(child)
            ):
                raise AccessError("Use saved credential reference strings.", 409)
            reference_only(child)
    elif isinstance(value, list):
        for child in value:
            reference_only(child)
    elif isinstance(value, str) and "PRIVATE KEY" in value:
        raise AccessError("Private keys cannot be delegated.", 409)


class Service:
    def __init__(self, server):
        self.s = server
        self.active_runs = set()

    def policy(self):
        try:
            return validate_policy(
                self.s._read_group_document(
                    self.s.CONFIG_DIR / "access_policy.json", empty_policy()
                )
            )
        except (ValueError, TypeError, KeyError, OSError):
            raise AccessError(
                "Access policy is unavailable. Contact an administrator.", 503
            ) from None

    def write_policy(self, value):
        self.s.write_json(self.s.CONFIG_DIR / "access_policy.json", value)

    def records(self, name):
        value = self.s._read_group_document(self.s.CONFIG_DIR / name, [])
        if not isinstance(value, list):
            raise AccessError("Operational records are unavailable.", 503)
        return value

    def save_record(self, name, record):
        with LOCK:
            records = self.records(name)
            records = [r for r in records if r["id"] != record["id"]]
            records.append(record)
            self.s.write_json(self.s.CONFIG_DIR / name, records[-2000:])

    def account(self, username):
        user = self.s._find_user(username)
        if (
            not user
            or user.get("disabled")
            or user.get("role") not in ("admin", "operator", "viewer")
        ):
            raise AccessError("Account is no longer authorised.", 401)
        return user

    def access(self, username):
        user = self.account(username)
        policy = self.policy()
        assignment = policy["assignments"].get(
            user["id"], {"scopeIds": [], "capabilities": []}
        )
        capabilities = (
            set(assignment["capabilities"]) if user["role"] == "operator" else set()
        )
        return user, policy, assignment, capabilities

    def scopes(self, policy, ids):
        selected = [s for s in policy["scopes"] if s["id"] in ids]
        if len(selected) != len(set(ids)) or not selected:
            raise AccessError("No assigned target scope.", 403)
        return selected

    def manifest(self, pipeline_id, scopes):
        pipeline = next(
            (p for p in self.s._load_pipelines() if p["id"] == pipeline_id), None
        )
        if (
            not pipeline
            or pipeline.get("executor", "legacy") != "legacy"
            or not 1 <= len(pipeline.get("steps", [])) <= 30
        ):
            raise AccessError("Only reviewed ZTF 1.x pipelines can be delegated.", 409)
        from urllib.parse import urlparse

        by_ip = {urlparse(s["connection"]["pe_endpoint"]).hostname: s for s in scopes}
        snapshots, identities, all_scopes = {}, [], set()
        for step in pipeline["steps"]:
            if step.get("workflow") != "config-cluster" or self.s._pipeline_step_error(
                step
            ):
                raise AccessError(
                    "An action requires administrator execution or a direct approved job.",
                    409,
                )
            path = self.s.safe_config_path(
                step.get("configFile", ""), self.s.get_configs_dir()
            )
            if not path or not path.is_file() or path.stat().st_size > 1024 * 1024:
                raise AccessError("A reviewed configuration file is unavailable.", 409)
            content = path.read_text(encoding="utf-8")
            try:
                # Use the shared strict YAML reader when available; duplicate keys fail closed below.
                class StrictLoader(yaml.SafeLoader):
                    def compose_node(self, parent, index):
                        if self.check_event(yaml.AliasEvent):
                            raise ValueError()
                        return super().compose_node(parent, index)

                def mapping(loader, node, deep=False):
                    result = {}
                    for key_node, value_node in node.value:
                        key = loader.construct_object(key_node, deep=deep)
                        if not isinstance(key, str) or key in result:
                            raise ValueError()
                        result[key] = loader.construct_object(value_node, deep=deep)
                    return result

                StrictLoader.add_constructor(
                    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping
                )
                data = yaml.load(content, Loader=StrictLoader)
            except Exception:
                raise AccessError(
                    "Delegated YAML must be unambiguous reference-only cluster configuration.",
                    409,
                ) from None
            reference_only(data)
            if (
                not isinstance(data, dict)
                or set(data)
                - {"clusters", "pc_ip", "pc_credential", "prism_login_title_verify_tls"}
                or not isinstance(data.get("clusters"), dict)
                or not data["clusters"]
            ):
                raise AccessError(
                    "This configuration schema is not eligible for scoped delegation.",
                    409,
                )
            if ("pc_ip" in data) != ("pc_credential" in data):
                raise AccessError(
                    "PC endpoint and credential must be explicit together.", 409
                )
            step_identities = []
            for ip, cluster in data["clusters"].items():
                if ip not in by_ip or not isinstance(cluster, dict):
                    raise AccessError(
                        "Every actual YAML target must belong to the reviewed scopes.",
                        403,
                    )
                scope = by_ip[ip]
                refs = scope["credentialRefs"]
                if step["workflow"] == "config-cluster":
                    allowed = {"name", "pe_credential"} | {
                        key
                        for task in yaml_studio_ops.TASKS
                        if task["action"] == "config-cluster"
                        for key in task["keys"]
                    }
                    if set(cluster) - allowed:
                        raise AccessError(
                            "Configuration contains fields outside the scoped delegation schemas.",
                            409,
                        )
                    covered = {"name", "pe_credential"}
                    for task in yaml_studio_ops.TASKS:
                        if (
                            task["action"] != "config-cluster"
                            or not task["keys"]
                            or not all(k in cluster for k in task["keys"])
                        ):
                            continue
                        covered.update(task["keys"])
                        candidate = {
                            "clusters": {
                                ip: {
                                    k: v
                                    for k, v in cluster.items()
                                    if k in {"name", "pe_credential", *task["keys"]}
                                }
                            }
                        }
                        if not yaml_studio_ops.validate(
                            task["id"], yaml.safe_dump(candidate), refs
                        )["valid"]:
                            raise AccessError(
                                "Use supported explicit cluster configuration values for delegation.",
                                409,
                            )
                    if set(cluster) - covered:
                        raise AccessError(
                            "A delegated task is incomplete or unsupported.", 409
                        )

                def check_refs(value):
                    if isinstance(value, dict):
                        for key, child in value.items():
                            if "credential" in key.lower() and child not in refs:
                                raise AccessError(
                                    "A credential reference is outside its target scope.",
                                    403,
                                )
                            check_refs(child)
                    elif isinstance(value, list):
                        for child in value:
                            check_refs(child)

                check_refs(cluster)
                if (
                    not cluster.get("name")
                    or not cluster.get("pe_credential")
                    or cluster["pe_credential"] not in refs
                ):
                    raise AccessError(
                        "Each target needs its reviewed PE identity and credential reference.",
                        409,
                    )
                if data.get("pc_ip") and (
                    data["pc_ip"] != scope["pcIp"]
                    or data.get("pc_credential") not in refs
                ):
                    raise AccessError(
                        "PC endpoint or credential is outside the reviewed scope.", 403
                    )
                step_identities.append((scope["id"], cluster["pe_credential"]))
                all_scopes.add(scope["id"])
            snapshots[step["configFile"]] = content
            identities.append(step_identities)
        if all_scopes != {s["id"] for s in scopes}:
            raise AccessError(
                "Review exactly the scopes targeted by this pipeline.", 409
            )
        global_config = self.s._load_global_config_data()
        if (
            set(global_config)
            - {"vaults", "vault_to_use", "ip_allocation_method", "ipam"}
            or global_config.get("ip_allocation_method", "static") != "static"
            or not isinstance(global_config.get("ipam", {}), dict)
            or global_config.get("ipam", {}).get("method", "static") != "static"
        ):
            raise AccessError(
                "Global routing defaults require administrator execution; scoped delegation supports explicit static targets only.",
                409,
            )
        fingerprint = digest(
            {
                "globalConfigHash": digest(global_config),
                "id": pipeline["id"],
                "steps": pipeline["steps"],
                "configs": {k: digest(v) for k, v in snapshots.items()},
                "scopes": scopes,
            }
        )
        return {
            "pipeline": pipeline,
            "snapshots": snapshots,
            "identities": identities,
            "fingerprint": fingerprint,
        }

    def binding_context(self, username, binding_id):
        user, policy, assignment, caps = self.access(username)
        if user["role"] != "operator" or "pipeline.execute" not in caps:
            raise AccessError("Pipeline execution has not been granted.")
        binding = next(
            (
                b
                for b in policy["bindings"]
                if b["id"] == binding_id and b["accountId"] == user["id"]
            ),
            None,
        )
        if not binding or not set(binding["scopeIds"]) <= set(assignment["scopeIds"]):
            raise AccessError(
                "Pipeline is not authorised for this account and scope.", 404
            )
        scopes = self.scopes(policy, binding["scopeIds"])
        result = self.manifest(binding["pipelineId"], scopes)
        if result["fingerprint"] != binding["fingerprint"]:
            raise AccessError(
                "Reviewed intent changed. A new administrator authorisation is required.",
                409,
            )
        return {
            **result,
            "binding": binding,
            "username": username,
            "accountId": user["id"],
            "scopes": scopes,
        }

    def identity(self, scope, reference, actor):
        config = {**scope["connection"], "pe_credential": reference}
        try:
            resolver = self.s._pe_login_title_resolver({})
            self.s._audit_pe_transport(
                config, "scoped-pipeline", "identity-readback", actor
            )
            client = pe_direct.Client(config, pe_direct.credential(config, resolver))
            observed = client.request("GET", "/cluster/")
            from pc_unregistration import cluster_uuid

            if cluster_uuid(observed.get("uuid")) != config["cluster_uuid"]:
                raise ValueError()
        except Exception:
            raise AccessError(
                "PE identity could not be verified. No new step was submitted.", 409
            ) from None

    def checkpoint(self, context, index):
        current = self.binding_context(context["username"], context["binding"]["id"])
        if (
            current["accountId"] != context["accountId"]
            or current["fingerprint"] != context["fingerprint"]
        ):
            raise AccessError("Execution authorisation changed.", 409)
        scopes = {s["id"]: s for s in current["scopes"]}
        for scope_id, ref in current["identities"][index]:
            self.identity(scopes[scope_id], ref, context["username"])
        # A slow readback must not outlive a role, target or delegation revocation.
        fresh = self.binding_context(context["username"], context["binding"]["id"])
        if (
            fresh["accountId"] != context["accountId"]
            or fresh["fingerprint"] != context["fingerprint"]
        ):
            raise AccessError(
                "Execution authorisation changed during identity readback.", 409
            )

    def cancelled(self, context):
        try:
            current = self.binding_context(
                context["username"], context["binding"]["id"]
            )
            if (
                current["accountId"] != context["accountId"]
                or current["fingerprint"] != context["fingerprint"]
            ):
                return True
        except AccessError:
            return True
        record = next(
            (
                r
                for r in self.records("operational_runs.json")
                if r["id"] == context["receiptId"]
            ),
            {},
        )
        return bool(record.get("cancelRequested"))

    def workspace(self, actor):
        user, policy, assignment, caps = self.access(actor)
        ids = set(assignment["scopeIds"])
        scopes = [
            {
                "id": s["id"],
                "name": s["name"],
                "datacenter": s["datacenter"],
                "peIp": s["connection"]["pe_endpoint"],
                "clusterUuid": s["connection"]["cluster_uuid"],
            }
            for s in policy["scopes"]
            if s["id"] in ids
        ]
        pipelines = []
        for binding in policy["bindings"]:
            if (
                user["role"] != "viewer" and binding["accountId"] != user["id"]
            ) or not set(binding["scopeIds"]) <= ids:
                continue
            pipeline = next(
                (
                    p
                    for p in self.s._load_pipelines()
                    if p["id"] == binding["pipelineId"]
                ),
                None,
            )
            if not pipeline:
                continue
            eligible = False
            try:
                manifest = self.manifest(
                    binding["pipelineId"], self.scopes(policy, binding["scopeIds"])
                )
                eligible = manifest["fingerprint"] == binding["fingerprint"]
            except AccessError:
                pass
            pipelines.append(
                {
                    "id": pipeline["id"],
                    "name": pipeline["name"],
                    "bindingId": binding["id"],
                    "scopeIds": binding["scopeIds"],
                    "steps": [
                        {"workflow": x.get("workflow", "")} for x in pipeline["steps"]
                    ],
                    "executable": eligible
                    and binding["accountId"] == user["id"]
                    and "pipeline.execute" in caps,
                    "reviewRequired": not eligible,
                }
            )
        # Receipts contain structured status only, never stdout, configuration or connection credentials.
        receipts = [
            {
                **{
                    k: r[k]
                    for k in (
                        "id",
                        "scopeIds",
                        "pipelineId",
                        "status",
                        "createdAt",
                        "events",
                        "finishedAt",
                        "reconciliationRequired",
                    )
                    if k in r
                },
                "canCancel": r.get("ownerId") == user["id"]
                and "jobs.cancel_own" in caps
                and r.get("status") == "running",
            }
            for r in self.records("operational_runs.json")
            if r.get("scopeIds") and set(r["scopeIds"]) <= ids
        ]
        requests = [
            {
                k: r[k]
                for k in ("id", "scopeIds", "kind", "status", "createdAt")
                if k in r
            }
            for r in self.records("operational_requests.json")
            if r.get("scopeIds") and set(r["scopeIds"]) <= ids
        ]
        recovery = []
        for run in self.s._recovery_read().get("runs", []):
            snap = run.get("snapshot", {})
            allowed = [
                s
                for s in policy["scopes"]
                if s["id"] in ids
                and s["connection"]["pe_endpoint"].split("//", 1)[-1].split(":", 1)[0]
                == snap.get("clusterVip")
            ]
            if allowed:
                recovery.append(
                    {
                        "id": run["id"],
                        "scopeIds": [s["id"] for s in allowed],
                        "status": run.get("status"),
                        "revision": run.get("revision"),
                        "completedSteps": sum(
                            s.get("status") == "success" for s in run.get("steps", [])
                        ),
                        "totalSteps": len(snap.get("steps", [])),
                    }
                )
        return {
            "user": {"username": actor, "role": user["role"]},
            "capabilities": sorted(caps),
            "scopes": scopes,
            "pipelines": pipelines,
            "runs": receipts,
            "requests": requests,
            "recovery": recovery,
            "drafts": [
                r
                for r in self.records("operational_drafts.json")
                if user["role"] == "operator"
                and r["ownerId"] == user["id"]
                and set(r["scopeIds"]) <= ids
            ],
        }


def register(server):
    service = Service(server)
    app = server.app

    @app.before_request
    def operational_access_boundary():
        if not request.path.startswith("/api/") or request.path in PUBLIC_AUTH:
            return None
        if (
            request.path.startswith("/api/access/")
            and request.content_length
            and request.content_length > 1024 * 1024
        ):
            return jsonify({"error": "Access request too large."}), 413
        session = server._current_session()
        if not session:
            return jsonify({"error": "Unauthorized"}), 401
        if session["role"] == "admin":
            return None
        if not request.path.startswith("/api/access/"):
            server.log.warning(
                "scoped_access_denied",
                extra={
                    "user": session["username"],
                    "action": "access_denied",
                    "endpoint": request.endpoint or "unknown",
                },
            )
            return jsonify(
                {
                    "error": "This role uses the scoped Operations workspace. Administration and unrestricted APIs are not available."
                }
            ), 403

    @app.after_request
    def private_access_responses(response):
        if request.path.startswith("/api/access/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    def endpoint(path, methods, roles):
        def decorate(function):
            def call(**kwargs):
                try:
                    payload = request.get_json(silent=True)
                    if payload is not None and not isinstance(payload, dict):
                        raise AccessError("Provide a JSON object.", 400)
                    return function(**kwargs)
                except AccessError as error:
                    return jsonify({"error": str(error)}), error.status
                except (ValueError, TypeError, KeyError, OSError):
                    return jsonify(
                        {"error": "Access metadata could not be verified."}
                    ), 503

            call.__name__ = "scoped_" + function.__name__
            app.add_url_rule(
                "/api/access" + path,
                view_func=server.require_role(*roles)(call),
                methods=methods,
            )
            return call

        return decorate

    @endpoint("/workspace", ["GET"], ("admin", "operator", "viewer"))
    def workspace():
        return jsonify(service.workspace(request.current_user["username"]))

    @endpoint("/admin", ["GET"], ("admin",))
    def admin_catalogue():
        return jsonify(
            {
                "policy": service.policy(),
                "users": [
                    {"id": u["id"], "username": u["username"], "role": u["role"]}
                    for u in server._load_users()
                ],
                "pipelines": [
                    {"id": p["id"], "name": p["name"]} for p in server._load_pipelines()
                ],
                "requests": service.records("operational_requests.json"),
                "drafts": service.records("operational_drafts.json"),
                "runs": service.records("operational_runs.json"),
            }
        )

    @endpoint("/admin/policy", ["PUT"], ("admin",))
    def save_policy():
        with LOCK:
            proposed = validate_policy(request.get_json(silent=True))
            current = service.policy()
            if proposed["revision"] != current["revision"]:
                raise AccessError("Access policy changed. Reload before saving.", 409)
            # Binding approval is a separate reviewed operation, never a generic policy edit.
            if proposed["bindings"] != current["bindings"]:
                raise AccessError(
                    "Use the reviewed pipeline authorisation operation.", 400
                )
            users = {u["id"]: u for u in server._load_users()}
            for account_id, item in proposed["assignments"].items():
                if (
                    account_id not in users
                    and item != current["assignments"].get(account_id)
                ) or (
                    account_id in users
                    and users[account_id]["role"] == "viewer"
                    and item["capabilities"]
                ):
                    raise AccessError(
                        "Viewer accounts cannot receive execution or authoring capabilities.",
                        400,
                    )
            proposed["revision"] += 1
            service.write_policy(proposed)
            server.log.info(
                "access_policy_updated",
                extra={
                    "user": request.current_user["username"],
                    "action": "access_policy_update",
                    "revision": proposed["revision"],
                },
            )
            return jsonify(proposed)

    @endpoint("/admin/review", ["POST"], ("admin",))
    def review_pipeline():
        data = request.get_json(silent=True) or {}
        user = next(
            (
                u
                for u in server._load_users()
                if u["id"] == data.get("accountId")
                and u["role"] == "operator"
                and not u.get("disabled")
            ),
            None,
        )
        if not user:
            raise AccessError("Select an active Operator account.", 400)
        with server.studio_routes.PIPELINE_LOCK, server.studio_routes.FILE_LOCK, LOCK:
            policy = service.policy()
            assignment = policy["assignments"].get(user["id"], {})
            ids = data.get("scopeIds", [])
            if not string_list(ids, set(assignment.get("scopeIds", []))):
                raise AccessError("Scopes are not assigned to this account.", 403)
            manifest = service.manifest(
                data.get("pipelineId"), service.scopes(policy, ids)
            )
            return jsonify(
                {
                    "fingerprint": manifest["fingerprint"],
                    "revision": policy["revision"],
                    "pipelineId": manifest["pipeline"]["id"],
                    "stepCount": len(manifest["pipeline"]["steps"]),
                    "scopeIds": ids,
                    "steps": manifest["pipeline"]["steps"],
                }
            )

    @endpoint("/admin/authorise", ["POST"], ("admin",))
    def authorise_pipeline():
        data = request.get_json(silent=True) or {}
        with server.studio_routes.PIPELINE_LOCK, server.studio_routes.FILE_LOCK, LOCK:
            user = next(
                (
                    u
                    for u in server._load_users()
                    if u["id"] == data.get("accountId")
                    and u["role"] == "operator"
                    and not u.get("disabled")
                ),
                None,
            )
            if (
                not user
                or user["username"].casefold()
                == request.current_user["username"].casefold()
            ):
                raise AccessError(
                    "A different administrator must authorise the Operator.", 403
                )
            policy = service.policy()
            ids = data.get("scopeIds", [])
            if data.get("revision") != policy["revision"] or not string_list(
                ids, set(policy["assignments"].get(user["id"], {}).get("scopeIds", []))
            ):
                raise AccessError("Assignment changed. Review again.", 409)
            manifest = service.manifest(
                data.get("pipelineId"), service.scopes(policy, ids)
            )
            if (
                manifest["fingerprint"] != data.get("fingerprint")
                or data.get("confirmation")
                != "AUTHORISE "
                + manifest["pipeline"]["id"]
                + " FOR "
                + user["username"]
            ):
                raise AccessError("Review exact intent and type its confirmation.", 409)
            binding = {
                "id": str(uuid.uuid4()),
                "accountId": user["id"],
                "pipelineId": manifest["pipeline"]["id"],
                "scopeIds": ids,
                "fingerprint": manifest["fingerprint"],
                "approvedBy": request.current_user["username"],
                "approvedAt": now(),
            }
            policy["bindings"] = [
                b
                for b in policy["bindings"]
                if not (
                    b["accountId"] == user["id"]
                    and b["pipelineId"] == manifest["pipeline"]["id"]
                )
            ] + [binding]
            policy["revision"] += 1
            service.write_policy(policy)
            server.log.info(
                "pipeline_delegated",
                extra={
                    "user": request.current_user["username"],
                    "action": "pipeline_delegate",
                    "bindingId": binding["id"],
                    "accountId": user["id"],
                },
            )
            return jsonify(binding), 201

    @endpoint("/admin/bindings/<identity>", ["DELETE"], ("admin",))
    def revoke_binding(identity):
        with LOCK:
            policy = service.policy()
            policy["bindings"] = [b for b in policy["bindings"] if b["id"] != identity]
            policy["revision"] += 1
            service.write_policy(policy)
            server.log.info(
                "delegation_revoked",
                extra={
                    "user": request.current_user["username"],
                    "action": "delegation_revoke",
                    "bindingId": identity,
                },
            )
        return jsonify({"success": True})

    @endpoint("/admin/runs/<identity>/reconcile", ["POST"], ("admin",))
    def reconcile_interrupted_run(identity):
        data = request.get_json(silent=True) or {}
        if (
            data.get("confirmation") != "RECONCILE " + identity
            or data.get("remoteWorkEnded") is not True
        ):
            raise AccessError(
                "Verify remote work has ended and confirm the exact run.", 400
            )
        evidence = text(data.get("evidence"), 500)
        with LOCK:
            if identity in service.active_runs:
                raise AccessError(
                    "The local run is still active. Do not reconcile it as ended.", 409
                )
            record = next(
                (
                    r
                    for r in service.records("operational_runs.json")
                    if r["id"] == identity
                ),
                None,
            )
            if not record or (
                record["status"] == "success"
                and not record.get("reconciliationRequired")
            ):
                raise AccessError("No interrupted or failed run to reconcile.", 404)
            record.update(
                status="reconciled",
                reconciliationRequired=False,
                reconciledBy=request.current_user["username"],
                reconciledAt=now(),
                evidence=evidence,
            )
            service.save_record("operational_runs.json", record)
            # A new binding is required; no completed step is automatically restarted.
            policy = service.policy()
            policy["bindings"] = [
                b for b in policy["bindings"] if b["id"] != record.get("bindingId")
            ]
            policy["revision"] += 1
            service.write_policy(policy)
            server.log.info(
                "scoped_run_reconciled",
                extra={
                    "user": request.current_user["username"],
                    "action": "scoped_run_reconcile",
                    "runId": identity,
                },
            )
        return jsonify({"status": "reconciled", "newReviewRequired": True})

    @endpoint("/requests", ["POST"], ("operator",))
    def create_request():
        user, policy, assignment, caps = service.access(
            request.current_user["username"]
        )
        if "requests.create" not in caps:
            raise AccessError("Operational requests have not been granted.")
        data = request.get_json(silent=True) or {}
        ids = data.get("scopeIds", [])
        if not string_list(ids, set(assignment["scopeIds"])) or not ids:
            raise AccessError("Request is outside assigned scopes.")
        if data.get("kind") not in ("deployment", "recovery", "change"):
            raise AccessError("Choose a supported request kind.", 400)
        record = {
            "id": str(uuid.uuid4()),
            "ownerId": user["id"],
            "requestedBy": user["username"],
            "scopeIds": ids,
            "kind": data["kind"],
            "status": "pending",
            "createdAt": now(),
        }
        service.save_record("operational_requests.json", record)
        server.log.info(
            "operational_request",
            extra={
                "user": user["username"],
                "action": "operational_request",
                "requestId": record["id"],
            },
        )
        return jsonify(record), 201

    @endpoint("/admin/requests/<identity>", ["PATCH"], ("admin",))
    def review_request(identity):
        data = request.get_json(silent=True) or {}
        if data.get("status") not in ("reviewed", "rejected"):
            raise AccessError("Choose reviewed or rejected.", 400)
        with LOCK:
            record = next(
                (
                    r
                    for r in service.records("operational_requests.json")
                    if r["id"] == identity
                ),
                None,
            )
            if not record:
                raise AccessError("Request not found.", 404)
            record.update(
                status=data["status"],
                reviewedBy=request.current_user["username"],
                reviewedAt=now(),
            )
            service.save_record("operational_requests.json", record)
            server.log.info(
                "operational_request_reviewed",
                extra={
                    "user": request.current_user["username"],
                    "action": "operational_request_review",
                    "requestId": identity,
                    "status": data["status"],
                },
            )
        return jsonify(record)

    @endpoint("/drafts", ["POST"], ("operator",))
    def create_draft():
        user, policy, assignment, caps = service.access(
            request.current_user["username"]
        )
        if "drafts.create" not in caps:
            raise AccessError("Draft authoring has not been granted.")
        data = request.get_json(silent=True) or {}
        ids = data.get("scopeIds", [])
        if not string_list(ids, set(assignment["scopeIds"])) or not ids:
            raise AccessError("Draft is outside assigned scopes.")
        # Drafts contain only a requested action list, not executable YAML or plaintext credentials.
        steps = data.get("steps")
        if (
            not isinstance(steps, list)
            or not 1 <= len(steps) <= 30
            or any(not isinstance(s, str) or s not in ACTIONS for s in steps)
        ):
            raise AccessError("Draft needs supported action IDs only.", 400)
        record = {
            "id": str(uuid.uuid4()),
            "ownerId": user["id"],
            "scopeIds": ids,
            "name": text(data.get("name")),
            "steps": steps,
            "status": "draft",
            "createdAt": now(),
        }
        service.save_record("operational_drafts.json", record)
        return jsonify(record), 201

    @endpoint("/runs/<identity>/cancel", ["POST"], ("operator",))
    def cancel_run(identity):
        user, policy, assignment, caps = service.access(
            request.current_user["username"]
        )
        record = next(
            (
                r
                for r in service.records("operational_runs.json")
                if r["id"] == identity
            ),
            None,
        )
        if (
            not record
            or record["ownerId"] != user["id"]
            or not set(record["scopeIds"]) <= set(assignment["scopeIds"])
        ):
            raise AccessError("Run not found.", 404)
        if "jobs.cancel_own" not in caps:
            raise AccessError("Cancellation has not been granted.")
        if record["status"] != "running":
            raise AccessError("Only an active owned run can be cancelled.", 409)
        record["cancelRequested"] = True
        service.save_record("operational_runs.json", record)
        return jsonify(
            {"status": "cancellation_requested", "reconciliationRequired": True}
        ), 202

    @endpoint("/pipelines/<identity>/run", ["POST"], ("operator",))
    def run_pipeline(identity):
        actor = request.current_user["username"]
        data = request.get_json(silent=True) or {}
        with server.studio_routes.PIPELINE_LOCK, server.studio_routes.FILE_LOCK, LOCK:
            context = service.binding_context(actor, identity)
            if data != {"confirmation": "RUN " + context["pipeline"]["id"]}:
                raise AccessError(
                    "Type the exact reviewed pipeline confirmation. Other execution overrides are not permitted.",
                    400,
                )
            records = service.records("operational_runs.json")
            targets = {s["id"] for s in context["scopes"]}
            if any(
                r.get("status") == "running"
                and (
                    r.get("ownerId") == context["accountId"]
                    or targets.intersection(r.get("scopeIds", []))
                )
                for r in records
            ):
                raise AccessError(
                    "An owned run is already active. Reconcile interrupted runs with an administrator.",
                    409,
                )
            if any(
                r.get("bindingId") == identity
                and (r.get("status") != "success" or r.get("reconciliationRequired"))
                for r in records
            ):
                raise AccessError(
                    "A previous attempt needs administrator reconciliation and a new review. Use recovery to preserve completed work.",
                    409,
                )
            # Account and current scope are checked again inside the runner before each step.
            context["receiptId"] = str(uuid.uuid4())
            context["service"] = service
            record = {
                "id": context["receiptId"],
                "ownerId": context["accountId"],
                "scopeIds": [s["id"] for s in context["scopes"]],
                "pipelineId": context["pipeline"]["id"],
                "bindingId": identity,
                "status": "running",
                "createdAt": now(),
                "events": [],
                "cancelRequested": False,
            }
            g.scoped_pipeline = context
            response = server.run_pipeline(context["pipeline"]["id"])
            if not isinstance(response, Response) or response.status_code != 200:
                status = (
                    response.status_code
                    if isinstance(response, Response)
                    else response[1]
                )
                return jsonify(
                    {
                        "error": "Reviewed execution did not start. Ask an administrator to check Governance and runtime readiness."
                    }
                ), status
            service.save_record("operational_runs.json", record)
            service.active_runs.add(record["id"])
        original = response
        finished = False

        def finish(status="interrupted"):
            nonlocal finished
            if finished:
                return
            finished = True
            try:
                original.close()
            finally:
                with LOCK:
                    service.active_runs.discard(record["id"])
                    record["cancelRequested"] = service.cancelled(context)
                    record["status"] = status
                    record["finishedAt"] = now()
                    record["reconciliationRequired"] = (
                        status != "success" or record["cancelRequested"]
                    )
                    service.save_record("operational_runs.json", record)

        def filtered():
            status = "interrupted"
            try:
                yield (
                    "data: "
                    + json.dumps({"type": "receipt", "data": {"id": record["id"]}})
                    + "\n\n"
                )
                for chunk in original.response:
                    value = chunk.decode() if isinstance(chunk, bytes) else chunk
                    for line in value.splitlines():
                        if not line.startswith("data: "):
                            continue
                        event = json.loads(line[6:])
                        kind = event.get("type")
                        if kind not in (
                            "pipeline_start",
                            "step_start",
                            "step_complete",
                            "step_skipped",
                            "pipeline_done",
                        ):
                            continue
                        raw = event.get("data", {})
                        safe = {
                            k: v
                            for k, v in raw.items()
                            if k in ("step", "status", "returnCode", "totalSteps")
                        }
                        if kind == "pipeline_done":
                            status = raw.get("status", "failed")
                        clean = {"type": kind, "data": safe}
                        # Preserve completed work even when the caller has just lost read access.
                        record["events"] = (record["events"] + [clean])[-200:]
                        with LOCK:
                            record["cancelRequested"] = service.cancelled(context)
                            service.save_record("operational_runs.json", record)
                        fresh_user, _, fresh_assignment, _ = service.access(actor)
                        if (
                            fresh_user["id"] != context["accountId"]
                            or fresh_user["role"] != "operator"
                            or not set(record["scopeIds"])
                            <= set(fresh_assignment["scopeIds"])
                        ):
                            return
                        yield "data: " + json.dumps(clean) + "\n\n"
            finally:
                finish(status)

        public_response = Response(
            stream_with_context(filtered()),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-store"},
        )
        # Also release an accepted response that is closed before its generator starts.
        public_response.call_on_close(finish)
        return public_response

    return service
