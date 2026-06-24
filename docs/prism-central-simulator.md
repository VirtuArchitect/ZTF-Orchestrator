# Prism Central Simulator

ZTF-Orchestrator can be smoke-tested without Nutanix hardware by running the
local simulator in `scripts/prism_central_simulator.py`. The simulator is a
small Python HTTP service that provides enough Prism Central-shaped behavior for
connection checks, dry-run TCP preflight checks, and simple API-client tests.

It is not a replacement for Prism Central, Prism Element, Foundation Central, or
Community Edition. Use a real Nutanix lab before trusting workflow execution in
production.

## Start The Simulator

```powershell
python scripts\prism_central_simulator.py --host 127.0.0.1 --port 9440
```

Default credentials:

```text
admin / nutanix/4u
```

## Configure ZTF-Orchestrator

Add a local credential reference in Global Config:

```yaml
vault_to_use: local
vaults:
  local:
    credentials:
      pc_user:
        username: admin
        password: nutanix/4u
```

In Settings, set the Prism Central endpoint to:

```text
http://127.0.0.1:9440
```

The backend only allows HTTP Prism Central login checks for loopback simulator
hosts. Non-local Prism Central endpoints continue to use HTTPS.

## Smoke Test Examples

Settings connection test:

```powershell
python scripts\prism_central_simulator.py --host 127.0.0.1 --port 9440
```

Then use Settings -> Prism Central -> Test.

Dry-run preflight YAML:

```yaml
pc_ip: 127.0.0.1
pc_credential: pc_user
cvm_credential: cvm_cred
clusters:
  - name: simulated
```

Run a dry-run for a workflow such as `cluster-create`. The TCP reachability
check should pass against `127.0.0.1:9440`.

Direct API probe:

```powershell
$pair = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:nutanix/4u"))
Invoke-RestMethod -Uri http://127.0.0.1:9440/api/nutanix/v3/users/me -Headers @{ Authorization = "Basic $pair" }
```
