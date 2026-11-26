"""Named access profiles and bulk selections. No remote discovery or execution.

Organisation records supply stable cluster IDs, never execution authority by
themselves. Exact reviewed scopes and runtime identity checks remain separate.
"""
from copy import deepcopy
from urllib.parse import urlparse
import hashlib

from credential_organization import empty_organization, validate_organization

READ_CAPS = {"clusters.view", "history.view"}
WRITE_CAPS = {"pipeline.execute", "requests.create", "drafts.create", "jobs.cancel_own"}
ALL_CAPS = READ_CAPS | WRITE_CAPS


def identifier(prefix, value):
    return prefix + hashlib.sha256(value.encode()).hexdigest()[:32]


def defaults():
    return {"version": 1, "revision": 0, "profiles": [
        {"id": "viewer", "name": "Viewer", "role": "viewer", "capabilities": sorted(READ_CAPS)},
        {"id": "operator", "name": "Operator", "role": "operator", "capabilities": sorted(ALL_CAPS)},
    ], "assignments": {}}


def validate(value):
    from scoped_access import AccessError, ID, text, string_list
    if (not isinstance(value, dict) or set(value) != set(defaults())
            or type(value["version"]) is not int or value["version"] != 1
            or type(value["revision"]) is not int or value["revision"] < 0
            or not isinstance(value["profiles"], list) or not 1 <= len(value["profiles"]) <= 100
            or not isinstance(value["assignments"], dict) or len(value["assignments"]) > 2000):
        raise AccessError("Invalid bulk access document.", 400)
    profiles = {}
    for profile in value["profiles"]:
        if (not isinstance(profile, dict) or set(profile) != {"id", "name", "role", "capabilities"}
                or not isinstance(profile["id"], str) or not ID.fullmatch(profile["id"])
                or profile["id"] in profiles or profile["role"] not in ("viewer", "operator")
                or not string_list(profile["capabilities"], ALL_CAPS)
                or "clusters.view" not in profile["capabilities"]
                or (profile["role"] == "viewer" and set(profile["capabilities"]) - READ_CAPS)):
            raise AccessError("Use unique Viewer or Operator profiles; Viewers are read-only.", 400)
        text(profile["name"])
        profiles[profile["id"]] = profile
    for account, assignment in value["assignments"].items():
        if (not isinstance(account, str) or not ID.fullmatch(account)
                or not isinstance(assignment, dict)
                or set(assignment) != {"profileId", "clusterIds", "datacenterIds"}
                or not isinstance(assignment["profileId"], str) or assignment["profileId"] not in profiles):
            raise AccessError("Invalid bulk account assignment.", 400)
        for key in ("clusterIds", "datacenterIds"):
            items = assignment[key]
            if (not isinstance(items, list) or len(items) > 500
                    or any(not isinstance(item, str) or not ID.fullmatch(item) for item in items)
                    or len(set(items)) != len(items)):
                raise AccessError("Use bounded unique cluster and datacentre IDs.", 400)
    return value


def load(server):
    return validate(server._read_group_document(server.CONFIG_DIR / "bulk_access.json", defaults()))


def inventory(server, raw):
    """Join by exact labels only for technical resolution, not for access grants.

    Existing reviewed scopes keep their IDs. Unresolved inventory clusters can
    be assigned read access; they cannot be delegated for execution.
    """
    organization = validate_organization(server._read_group_document(
        server.CONFIG_DIR / "credential_organization.json", empty_organization()))
    rows, scopes, used = [], [], set()
    operations = server._operations_service.load()["clusters"]
    groups = list(organization["groups"])
    labels = {(g["name"], g["datacenter"]) for g in groups if g["kind"] == "cluster"}
    for record in operations:
        label = (record["name"], record["datacenter"])
        if label not in labels:
            labels.add(label)
            groups.append({"id": identifier("managed-", record["id"]), "kind": "cluster",
                           "name": record["name"], "datacenter": record["datacenter"]})
    for group in groups:
        if group["kind"] != "cluster":
            continue
        matches = [s for s in raw["scopes"] if s["name"] == group["name"] and s["datacenter"] == group["datacenter"]]
        identity = matches[0]["id"] if len(matches) == 1 else identifier("catalog-", group["id"])
        if identity in used:
            raise ValueError("Ambiguous cluster catalogue")
        used.add(identity)
        scope = deepcopy(matches[0]) if len(matches) == 1 else {
            "id": identity, "name": group["name"], "datacenter": group["datacenter"],
            "credentialRefs": [], "pcIp": "", "connection": {
                "pe_endpoint": "", "cluster_uuid": "", "pe_credential": ""}}
        # Only a unique managed-cluster record with complete identity can supply
        # technical details. Credential labels alone never select credentials.
        records = [r for r in operations if r["name"] == group["name"] and r["datacenter"] == group["datacenter"]]
        if not matches and len(records) == 1:
            r = records[0]
            try:
                import pe_direct
                connection = pe_direct.connection({"mode": "pe-direct", "pe_endpoint": r["peEndpoint"],
                    "cluster_uuid": r["expectedUuid"], "pe_credential": r["peCredential"],
                    "verify_tls": True, "tls_bypass_reason": ""})
                pe_direct.host_ip(urlparse(connection["pe_endpoint"]).hostname)
                scope["connection"] = connection
                scope["credentialRefs"] = [connection["pe_credential"]]
            except (ValueError, TypeError):
                pass
        if len(matches) > 1:
            scope["connection"]["pe_endpoint"] = ""
        scopes.append(scope)
    for scope in raw["scopes"]:
        if scope["id"] not in used:
            scopes.append(deepcopy(scope))
    endpoints = [s["connection"]["pe_endpoint"] for s in scopes if s["connection"]["pe_endpoint"]]
    for scope in scopes:
        ready = bool(scope["connection"].get("cluster_uuid") and scope["connection"]["pe_endpoint"])
        if endpoints.count(scope["connection"]["pe_endpoint"]) > 1:
            ready = False
        if not ready:
            scope["connection"]["pe_endpoint"] = ""
        rows.append({"id": scope["id"], "name": scope["name"], "datacenter": scope["datacenter"],
            "datacenterId": identifier("dc-", scope["datacenter"]), "executionReady": ready})
    return rows, scopes


def effective(server, raw, document):
    if not document["assignments"]:
        return raw
    rows, scopes = inventory(server, raw)
    result = deepcopy(raw)
    result["scopes"] = scopes
    users = {u["id"]: u for u in server._load_users()}
    profiles = {p["id"]: p for p in document["profiles"]}
    for account, assignment in document["assignments"].items():
        profile = profiles[assignment["profileId"]]
        user = users.get(account)
        allowed = bool(user and not user.get("disabled") and user["role"] == profile["role"])
        result["assignments"][account] = {
            "scopeIds": [r["id"] for r in rows if allowed and
                (r["id"] in assignment["clusterIds"] or r["datacenterId"] in assignment["datacenterIds"])],
            "capabilities": list(profile["capabilities"]) if allowed else [],
        }
    return result


def catalogue(server, raw):
    from scoped_access import digest
    rows, scopes = inventory(server, raw)
    # Includes technical identity privately in the hash, never in the selector.
    # Collection timestamps/status changes do not invalidate an access review.
    return rows, digest({"rows": rows, "raw": raw, "resolvedScopes": scopes})


def preview(server, raw, proposed, current, catalogue_fingerprint):
    from scoped_access import AccessError, digest
    proposed = validate(deepcopy(proposed))
    rows, fingerprint = catalogue(server, raw)
    if catalogue_fingerprint != fingerprint or proposed["revision"] != current["revision"]:
        raise AccessError("Access or cluster inventory changed. Reload and review again.", 409)
    users = {u["id"]: u for u in server._load_users()}
    profiles = {p["id"]: p for p in proposed["profiles"]}
    known = {r["id"] for r in rows}
    dcs = {r["datacenterId"] for r in rows}
    for account, selection in proposed["assignments"].items():
        # Unchanged stale assignments remain revocable, but cannot be re-granted.
        if selection == current["assignments"].get(account):
            continue
        user = users.get(account)
        if (not user or user.get("disabled") or user["role"] != profiles[selection["profileId"]]["role"]
                or not set(selection["clusterIds"]) <= known or not set(selection["datacenterIds"]) <= dcs):
            raise AccessError("Select active accounts with the matching role and current clusters/datacentres.", 400)
    result = effective(server, raw, proposed)
    affected = set(current["assignments"]) | set(proposed["assignments"])
    summaries = []
    for account in sorted(affected):
        selection = proposed["assignments"].get(account)
        assignment = result["assignments"].get(account, {"scopeIds": [], "capabilities": []})
        summaries.append({"accountId": account, "username": users.get(account, {}).get("username", "Removed account"),
            "clusterCount": len(assignment["scopeIds"]), "capabilities": assignment["capabilities"],
            "inheritedDatacenters": len(selection["datacenterIds"]) if selection else 0,
            "legacyRestored": selection is None})
    # Bind the review to account roles/disabled state as well as both documents.
    token = digest({"current": current, "proposed": proposed, "catalogue": fingerprint,
                    "users": [{"id": u["id"], "role": u["role"], "disabled": u.get("disabled", False)} for u in users.values()]})
    return {"fingerprint": token, "accounts": summaries, "catalogueFingerprint": fingerprint}
