"""Defensive role, scope and exact-intent tests. All endpoints use synthetic data."""

import copy
import json
import uuid
from pathlib import Path
from types import SimpleNamespace
import pytest
import yaml
import scoped_access

UUID = "00000000-0000-0000-0000-000000000001"


def scope(identity="one", ip="192.0.2.20"):
    return {
        "id": identity,
        "name": "Example cluster",
        "datacenter": "Example DC",
        "pcIp": "192.0.2.30",
        "credentialRefs": ["pe_ref", "pe_new", "pc_ref"],
        "connection": {
            "mode": "pe-direct",
            "pe_endpoint": f"https://{ip}:9440",
            "pe_credential": "pe_ref",
            "cluster_uuid": UUID,
            "verify_tls": True,
            "tls_bypass_reason": "",
        },
    }


@pytest.fixture
def access(client, auth_headers, monkeypatch):
    import server

    users = server._load_users()
    accounts = {}
    for name, role in [
        ("operator", "operator"),
        ("viewer", "viewer"),
        ("other", "operator"),
    ]:
        user = {
            "id": str(uuid.uuid4()),
            "username": name,
            "role": role,
            "password_hash": "not-a-login-password",
        }
        users.append(user)
        accounts[name] = user
    server._save_users(users)
    headers = {
        name: {"Authorization": "Bearer " + server._create_session(name, u["role"])}
        for name, u in accounts.items()
    }
    service = server._access_service
    policy = scoped_access.empty_policy()
    policy["scopes"] = [scope(), scope("two", "192.0.2.21")]
    policy["assignments"] = {
        accounts[name]["id"]: {
            "scopeIds": ["one"],
            "capabilities": sorted(scoped_access.CAPABILITIES)
            if name == "operator"
            else [],
        }
        for name in ("operator", "viewer")
    }
    service.write_policy(policy)
    configs = server.get_configs_dir()
    configs.mkdir(parents=True, exist_ok=True)
    content = yaml.safe_dump(
        {
            "clusters": {
                "192.0.2.20": {
                    "name": "Example cluster",
                    "pe_credential": "pe_ref",
                    "enable_pulse": False,
                }
            }
        }
    )
    (configs / "safe.yml").write_text(content, encoding="utf-8")
    pipeline = {
        "id": "pipeline-one",
        "name": "Example baseline",
        "executor": "legacy",
        "steps": [{"workflow": "config-cluster", "configFile": "safe.yml"}],
    }
    server._save_pipelines([pipeline])
    server.write_json(
        server.SETTINGS_FILE, {**server.get_settings(), "approvalRequiredWorkflows": []}
    )
    monkeypatch.setattr(server, "_load_global_config_data", lambda: {})

    # Any accidental external API call is a test failure, never a live operation.
    def forbidden(*args, **kwargs):
        raise AssertionError("Unexpected real PE connection")

    monkeypatch.setattr(server.pe_direct.Client, "request", forbidden)
    return SimpleNamespace(
        client=client,
        admin=auth_headers,
        headers=headers,
        users=accounts,
        service=service,
        policy=policy,
        configs=configs,
        pipeline=pipeline,
        server=server,
    )


def authorise(h):
    payload = {
        "accountId": h.users["operator"]["id"],
        "pipelineId": "pipeline-one",
        "scopeIds": ["one"],
    }
    reviewed = h.client.post("/api/access/admin/review", json=payload, headers=h.admin)
    assert reviewed.status_code == 200, reviewed.get_json()
    payload.update(
        reviewed.get_json(), confirmation="AUTHORISE pipeline-one FOR operator"
    )
    response = h.client.post(
        "/api/access/admin/authorise", json=payload, headers=h.admin
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()


@pytest.mark.parametrize("role", ["operator", "viewer"])
@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/api/global-config"),
        ("GET", "/api/configs"),
        ("GET", "/api/configs/safe.yml"),
        ("GET", "/api/settings"),
        ("GET", "/api/pipelines"),
        ("GET", "/api/jobs"),
        ("GET", "/api/approvals"),
        ("GET", "/api/recovery/overview"),
        ("POST", "/api/execute"),
        ("POST", "/api/jobs"),
        ("POST", "/api/pipelines/pipeline-one/run"),
        ("POST", "/api/approvals/example/approve"),
        ("POST", "/api/recovery/runs/example/resume"),
        ("DELETE", "/api/jobs/example"),
        ("GET", "/api/access/admin"),
        ("PUT", "/api/access/admin/policy"),
    ],
)
def test_no_legacy_or_administration_bypass(access, role, method, path):
    result = access.client.open(
        path,
        method=method,
        headers=access.headers[role],
        json={} if method != "GET" else None,
    )
    assert result.status_code == 403
    assert "pe_ref" not in result.get_data(as_text=True)


@pytest.mark.parametrize(
    "path",
    [
        "/api/access/requests",
        "/api/access/drafts",
        "/api/access/pipelines/id/run",
        "/api/access/runs/id/cancel",
    ],
)
def test_viewer_never_writes(access, path):
    assert (
        access.client.post(
            path, headers=access.headers["viewer"], json={"scopeIds": ["one"]}
        ).status_code
        == 403
    )


def test_default_and_assigned_visibility_no_secrets(access):
    h = access
    empty = h.client.get("/api/access/workspace", headers=h.headers["other"])
    assert empty.status_code == 200 and empty.get_json()["scopes"] == []
    data = h.client.get("/api/access/workspace", headers=h.headers["viewer"])
    assert data.headers["Cache-Control"] == "no-store"
    assert [s["id"] for s in data.get_json()["scopes"]] == ["one"]
    assert data.get_json()["capabilities"] == []
    assert "pe_ref" not in data.get_data(as_text=True)
    assert "192.0.2.21" not in data.get_data(as_text=True)


def test_policy_revision_and_viewer_capabilities(access):
    h = access
    policy = copy.deepcopy(h.policy)
    policy["assignments"][h.users["viewer"]["id"]]["capabilities"] = [
        "pipeline.execute"
    ]
    assert (
        h.client.put(
            "/api/access/admin/policy", headers=h.admin, json=policy
        ).status_code
        == 400
    )
    policy = copy.deepcopy(h.policy)
    assert (
        h.client.put(
            "/api/access/admin/policy", headers=h.admin, json=policy
        ).status_code
        == 200
    )
    assert (
        h.client.put(
            "/api/access/admin/policy", headers=h.admin, json=policy
        ).status_code
        == 409
    )


def test_malformed_persisted_policy_fails_closed(access):
    h = access
    h.server.write_json(h.server.CONFIG_DIR / "access_policy.json", {"corrupt": True})
    response = h.client.get("/api/access/workspace", headers=h.headers["operator"])
    assert response.status_code == 503 and "scopes" not in response.get_json()


@pytest.mark.parametrize(
    "change",
    [
        "other-target",
        "other-credential",
        "secret",
        "alias",
        "duplicate",
        "endpoint-override",
        "unknown-global",
        "pc-missing",
        "unsupported-action",
    ],
)
def test_delegation_rejects_ambiguous_or_out_of_scope_intent(
    access, change, monkeypatch
):
    h = access
    data = yaml.safe_load((h.configs / "safe.yml").read_text())
    if change == "other-target":
        data["clusters"]["192.0.2.21"] = data["clusters"].pop("192.0.2.20")
    if change == "other-credential":
        data["clusters"]["192.0.2.20"]["pe_credential"] = "outside_ref"
    if change == "secret":
        data["clusters"]["192.0.2.20"]["password"] = "do-not-expose"
    if change == "endpoint-override":
        data["clusters"]["192.0.2.20"]["endpoint"] = "https://192.0.2.21:9440"
    if change == "unknown-global":
        monkeypatch.setattr(
            h.server,
            "_load_global_config_data",
            lambda: {"clusters": {"192.0.2.21": {}}},
        )
    if change == "pc-missing":
        data["pc_credential"] = "pc_ref"
    if change == "unsupported-action":
        h.pipeline["steps"][0]["workflow"] = "pod-config"
        h.server._save_pipelines([h.pipeline])
    content = yaml.safe_dump(data)
    if change == "alias":
        content = "clusters: &loop {192.0.2.20: *loop}"
    if change == "duplicate":
        content += "clusters: {}"
    (h.configs / "safe.yml").write_text(content, encoding="utf-8")
    response = h.client.post(
        "/api/access/admin/review",
        headers=h.admin,
        json={
            "accountId": h.users["operator"]["id"],
            "pipelineId": "pipeline-one",
            "scopeIds": ["one"],
        },
    )
    assert response.status_code in (403, 409), response.get_json()
    assert "do-not-expose" not in response.get_data(as_text=True)


def test_review_binding_drift_scope_and_revocation(access):
    h = access
    binding = authorise(h)
    assert (
        h.service.binding_context("operator", binding["id"])["fingerprint"]
        == binding["fingerprint"]
    )
    assert (
        h.client.get("/api/access/workspace", headers=h.headers["viewer"]).get_json()[
            "pipelines"
        ][0]["executable"]
        is False
    )
    (h.configs / "safe.yml").write_text(
        (h.configs / "safe.yml").read_text() + "\n# changed intent\n", encoding="utf-8"
    )
    response = h.client.post(
        "/api/access/pipelines/" + binding["id"] + "/run",
        headers=h.headers["operator"],
        json={"confirmation": "RUN pipeline-one"},
    )
    assert response.status_code == 409
    assert (
        h.client.delete(
            "/api/access/admin/bindings/" + binding["id"], headers=h.admin
        ).status_code
        == 200
    )
    with pytest.raises(scoped_access.AccessError):
        h.service.binding_context("operator", binding["id"])


def test_requests_and_drafts_do_not_execute_or_cross_scopes(access):
    h = access
    for path, body in [
        ("/requests", {"kind": "recovery"}),
        ("/drafts", {"name": "Plan", "steps": ["config-cluster"]}),
    ]:
        assert (
            h.client.post(
                "/api/access" + path,
                headers=h.headers["operator"],
                json={**body, "scopeIds": ["two"]},
            ).status_code
            == 403
        )
        response = h.client.post(
            "/api/access" + path,
            headers=h.headers["operator"],
            json={**body, "scopeIds": ["one"]},
        )
        assert response.status_code == 201
    request_id = h.service.records("operational_requests.json")[0]["id"]
    assert (
        h.client.patch(
            "/api/access/admin/requests/" + request_id,
            headers=h.admin,
            json={"status": "reviewed"},
        ).status_code
        == 200
    )
    assert h.service.records("operational_runs.json") == []


def test_active_session_demotion_disable_delete_and_last_admin(access):
    h = access
    users = h.server._load_users()
    next(u for u in users if u["username"] == "operator")["role"] = "viewer"
    h.server._save_users(users)
    assert (
        h.client.get("/api/auth/me", headers=h.headers["operator"]).get_json()["role"]
        == "viewer"
    )
    assert (
        h.client.post(
            "/api/access/requests",
            headers=h.headers["operator"],
            json={"kind": "recovery", "scopeIds": ["one"]},
        ).status_code
        == 403
    )
    next(u for u in users if u["username"] == "operator")["disabled"] = True
    h.server._save_users(users)
    assert (
        h.client.get("/api/auth/me", headers=h.headers["operator"]).status_code == 401
    )
    assert (
        h.client.put(
            "/api/users/admin", headers=h.admin, json={"role": "viewer"}
        ).status_code
        == 409
    )
    assert h.client.delete("/api/users/viewer", headers=h.admin).status_code == 200
    replacement = {**h.users["viewer"], "id": str(uuid.uuid4())}
    h.server._save_users(h.server._load_users() + [replacement])
    assert h.client.get("/api/auth/me", headers=h.headers["viewer"]).status_code == 401
    assert h.service.workspace("viewer")["scopes"] == []


def test_run_stream_freezes_yaml_masks_output_and_preserves_legacy_records(
    access, monkeypatch
):
    h = access
    binding = authorise(h)
    commands = []
    identities = []
    original = {
        p.name: p.read_bytes()
        for p in [h.server.CONFIG_DIR / "pipelines.json"]
        if p.exists()
    }
    monkeypatch.setattr(h.server, "_ztf_incompatible_error", lambda path: None)
    monkeypatch.setattr(
        h.service, "identity", lambda s, r, a: identities.append((s["id"], r))
    )

    class Proc:
        returncode = 0

        def __init__(self):
            self.stdout = iter(["secret=never-stream-this"])
            self.stderr = iter([])

        def poll(self):
            return 0

        def wait(self):
            pass

        def kill(self):
            pass

    def popen(command, **kwargs):
        commands.append(command)
        assert "-f" in command
        assert Path(command[-1]).read_text() == (h.configs / "safe.yml").read_text()
        assert Path(command[-1]) != h.configs / "safe.yml"
        return Proc()

    monkeypatch.setattr(h.server.subprocess, "Popen", popen)
    response = h.client.post(
        "/api/access/pipelines/" + binding["id"] + "/run",
        headers=h.headers["operator"],
        json={"confirmation": "RUN pipeline-one"},
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    output = response.get_data(as_text=True)
    assert "pipeline_done" in output and "success" in output
    assert (
        "never-stream-this" not in output
        and "pe_ref" not in output
        and "safe.yml" not in output
    )
    assert identities == [("one", "pe_ref")] and len(commands) == 1
    receipt = h.service.records("operational_runs.json")[0]
    assert receipt["status"] == "success" and not receipt["reconciliationRequired"]
    for name, content in original.items():
        assert (h.server.CONFIG_DIR / name).read_bytes() == content


def test_existing_governance_gate_still_blocks_delegation(access):
    h = access
    settings = h.server.get_settings()
    settings["approvalRequiredWorkflows"] = ["config-cluster"]
    h.server.write_json(h.server.SETTINGS_FILE, settings)
    response = h.client.post(
        "/api/access/admin/review",
        headers=h.admin,
        json={
            "accountId": h.users["operator"]["id"],
            "pipelineId": "pipeline-one",
            "scopeIds": ["one"],
        },
    )
    assert response.status_code == 409


def test_identity_mismatch_never_submits(access, monkeypatch):
    h = access
    binding = authorise(h)
    calls = []
    monkeypatch.setattr(h.server, "_ztf_incompatible_error", lambda path: None)
    monkeypatch.setattr(
        h.server,
        "_pe_login_title_resolver",
        lambda config: lambda ref: ("example", "synthetic-secret"),
    )
    monkeypatch.setattr(
        h.server.pe_direct.Client,
        "request",
        lambda *args, **kwargs: {"uuid": "00000000-0000-0000-0000-000000000002"},
    )
    monkeypatch.setattr(
        h.server.subprocess, "Popen", lambda *args, **kwargs: calls.append(args)
    )
    response = h.client.post(
        "/api/access/pipelines/" + binding["id"] + "/run",
        headers=h.headers["operator"],
        json={"confirmation": "RUN pipeline-one"},
    )
    assert response.status_code == 200 and "failed" in response.get_data(as_text=True)
    assert calls == []


def test_cancellation_and_revocation_stop_remaining_work(access):
    h = access
    binding = authorise(h)
    context = h.service.binding_context("operator", binding["id"])
    context["receiptId"] = "receipt"
    record = {
        "id": "receipt",
        "ownerId": h.users["operator"]["id"],
        "scopeIds": ["one"],
        "status": "running",
        "events": [],
    }
    h.service.save_record("operational_runs.json", record)
    assert not h.service.cancelled(context)
    assert (
        h.client.post(
            "/api/access/runs/receipt/cancel", headers=h.headers["other"]
        ).status_code
        == 404
    )
    assert (
        h.client.post(
            "/api/access/runs/receipt/cancel", headers=h.headers["operator"]
        ).status_code
        == 202
    )
    assert h.service.cancelled(context)
    h.client.delete("/api/access/admin/bindings/" + binding["id"], headers=h.admin)
    assert h.service.cancelled(context)


def test_reconciliation_requires_admin_evidence_and_never_retries(access):
    h = access
    binding = authorise(h)
    record = {
        "id": "interrupted",
        "ownerId": h.users["operator"]["id"],
        "scopeIds": ["one"],
        "pipelineId": "pipeline-one",
        "bindingId": binding["id"],
        "status": "running",
        "events": [],
        "cancelRequested": False,
    }
    h.service.save_record("operational_runs.json", record)
    url = "/api/access/admin/runs/interrupted/reconcile"
    body = {
        "confirmation": "RECONCILE interrupted",
        "remoteWorkEnded": True,
        "evidence": "Independent synthetic state readback recorded",
    }
    assert (
        h.client.post(url, headers=h.headers["operator"], json=body).status_code == 403
    )
    assert h.client.post(url, headers=h.admin, json={}).status_code == 400
    h.service.active_runs.add("interrupted")
    assert h.client.post(url, headers=h.admin, json=body).status_code == 409
    h.service.active_runs.clear()
    assert h.client.post(url, headers=h.admin, json=body).status_code == 200
    assert h.service.records("operational_runs.json")[0]["status"] == "reconciled"
    assert h.service.policy()["bindings"] == []
    assert h.server._load_pipelines() == [h.pipeline]


@pytest.mark.parametrize("payload", [[], ["one"], {"scopes": []}, {"version": True}])
def test_malformed_policy_does_not_change_persisted_grants(access, payload):
    h = access
    before = h.service.policy()
    response = h.client.put("/api/access/admin/policy", headers=h.admin, json=payload)
    assert response.status_code == 400
    assert h.service.policy() == before


def test_role_downgrade_does_not_expose_previous_operator_drafts(access):
    h = access
    h.service.save_record(
        "operational_drafts.json",
        {
            "id": "draft",
            "ownerId": h.users["operator"]["id"],
            "scopeIds": ["one"],
            "name": "private draft",
            "steps": ["config-cluster"],
        },
    )
    users = h.server._load_users()
    next(u for u in users if u["username"] == "operator")["role"] = "viewer"
    h.server._save_users(users)
    workspace = h.client.get(
        "/api/access/workspace", headers=h.headers["operator"]
    ).get_json()
    assert workspace["drafts"] == [] and workspace["capabilities"] == []


def test_login_cannot_overwrite_a_concurrent_role_change(access, monkeypatch):
    import threading

    h = access
    entered = threading.Event()
    release = threading.Event()
    changed = threading.Event()
    results = {}

    def check(*args):
        entered.set()
        assert release.wait(5)
        return True

    monkeypatch.setattr(h.server.bcrypt, "checkpw", check)

    def login():
        with h.server.app.test_client() as client:
            results["login"] = client.post(
                "/api/auth/login",
                json={"username": "operator", "password": "synthetic-only"},
            ).status_code

    def demote():
        with h.server.app.test_client() as client:
            results["change"] = client.put(
                "/api/users/operator", headers=h.admin, json={"role": "viewer"}
            ).status_code
        changed.set()

    first = threading.Thread(target=login)
    second = threading.Thread(target=demote)
    first.start()
    assert entered.wait(5)
    second.start()
    try:
        assert not changed.wait(0.05)
    finally:
        release.set()
        first.join(5)
        second.join(5)
    assert results == {"login": 200, "change": 200}
    assert h.server._find_user("operator")["role"] == "viewer"


def test_revocation_during_slow_identity_readback_stops_before_submission(
    access, monkeypatch
):
    h = access
    binding = authorise(h)
    context = h.service.binding_context("operator", binding["id"])

    def revoke(*args):
        policy = h.service.policy()
        policy["bindings"] = []
        h.service.write_policy(policy)

    monkeypatch.setattr(h.service, "identity", revoke)
    with pytest.raises(scoped_access.AccessError):
        h.service.checkpoint(context, 0)


def test_unconsumed_response_closes_with_reconciliation_receipt(access, monkeypatch):
    h = access
    binding = authorise(h)
    monkeypatch.setattr(h.server, "_ztf_incompatible_error", lambda path: None)
    with h.server.app.test_request_context(
        "/api/access/pipelines/" + binding["id"] + "/run",
        method="POST",
        headers=h.headers["operator"],
        json={"confirmation": "RUN pipeline-one"},
    ):
        response = h.server.app.view_functions["scoped_run_pipeline"](
            identity=binding["id"]
        )
        assert h.service.active_runs
        response.close()
    assert not h.service.active_runs
    record = h.service.records("operational_runs.json")[0]
    assert record["status"] == "interrupted" and record["reconciliationRequired"]


def test_scoped_recovery_summary_omits_other_clusters_and_raw_snapshots(
    access, monkeypatch
):
    h = access
    runs = [
        {
            "id": "allowed",
            "status": "needs_reconciliation",
            "steps": [{"status": "success"}] * 7,
            "snapshot": {
                "clusterVip": "192.0.2.20",
                "steps": [{}] * 8,
                "configContent": "never-return-secret",
            },
        },
        {
            "id": "other-cluster",
            "status": "complete",
            "steps": [],
            "snapshot": {"clusterVip": "192.0.2.21", "steps": []},
        },
    ]
    monkeypatch.setattr(h.server, "_recovery_read", lambda: {"runs": runs})
    response = h.client.get("/api/access/workspace", headers=h.headers["viewer"])
    assert response.get_json()["recovery"][0]["completedSteps"] == 7
    assert response.get_json()["recovery"][0]["totalSteps"] == 8
    assert "other-cluster" not in response.get_data(as_text=True)
    assert "never-return-secret" not in response.get_data(as_text=True)


def test_completed_step_receipt_survives_scope_revocation(access, monkeypatch):
    from flask import Response

    h = access
    binding = authorise(h)

    def events():
        yield (
            "data: "
            + json.dumps({"type": "pipeline_start", "data": {"totalSteps": 2}})
            + "\n\n"
        )
        policy = h.service.policy()
        policy["assignments"][h.users["operator"]["id"]]["scopeIds"] = []
        h.service.write_policy(policy)
        yield (
            "data: "
            + json.dumps(
                {
                    "type": "step_complete",
                    "data": {"step": 0, "status": "success", "returnCode": 0},
                }
            )
            + "\n\n"
        )
        pytest.fail("A later step was consumed after scope revocation")

    monkeypatch.setattr(
        h.server,
        "run_pipeline",
        lambda pipeline_id: Response(events(), mimetype="text/event-stream"),
    )
    response = h.client.post(
        "/api/access/pipelines/" + binding["id"] + "/run",
        headers=h.headers["operator"],
        json={"confirmation": "RUN pipeline-one"},
    )
    output = response.get_data(as_text=True)
    record = h.service.records("operational_runs.json")[0]
    assert record["events"][-1] == {
        "type": "step_complete",
        "data": {"step": 0, "status": "success", "returnCode": 0},
    }
    assert "step_complete" not in output
    assert record["reconciliationRequired"] and record["status"] == "interrupted"
