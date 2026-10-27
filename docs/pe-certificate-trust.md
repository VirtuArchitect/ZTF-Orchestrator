# Persistent PE Certificate Trust in Docker

Use this procedure for verified-HTTPS clients such as Create Local Users (PE),
live PE drift collection and Upgrade Advisor. It changes Orchestrator trust,
not the certificate or configuration on the physical PE cluster. It does not
replace the legacy Configure Cluster HTTP transport. Keep its debug logging
disabled during password operations.

## Export and approve the certificates

1. Confirm the intended PE DNS name or IP, certificate renewal owner and issuing
   PKI. The endpoint must match a Subject Alternative Name (SAN).
2. Export the public certificate chain through the browser certificate viewer
   or obtain the issuing CA chain directly from the PKI administrator. Never
   export private keys. PEM and Base-64 X.509 are suitable inputs.
3. Independently confirm certificate SHA256 fingerprints, issuer, validity and
   SAN through the PKI/cluster owner. An endpoint returning a certificate does
   not establish its trustworthiness. A self-signed certificate requires explicit
   approval as a trust anchor, including its exact endpoint identity.

For inspection on a trusted Linux host, replace the documentation endpoint:

```bash
openssl s_client -connect pe.example.com:9440 -servername pe.example.com \
  -showcerts </dev/null

openssl x509 -in approved-pe-ca.pem -noout \
  -subject -issuer -dates -fingerprint -sha256
```

The first command displays certificates for review; it does not approve or
install them. Inspect the PE leaf SAN separately. Use the correct DNS endpoint
or replace an incorrect certificate instead of disabling verification.

## Prepare a persistent combined bundle

Run on the appliance host after transferring the approved PEM CA chain there:

Review and back up any existing destination before replacing it. Keep existing
public and private roots needed by other integrations; do not replace them all
with a single PE certificate. PEM bundles contain public certificates only.

```bash
sudo install -d -m 0755 /opt/ztf-orchestrator/certs

current_ca=$(sudo docker exec ztf-orchestrator /opt/ztf-python/bin/python \
  -c 'import ssl; print(ssl.get_default_verify_paths().cafile or "")')
test -n "$current_ca" || { echo 'STOP: locate the current Python CA bundle'; exit 1; }

sudo docker cp -L "ztf-orchestrator:$current_ca" \
  /opt/ztf-orchestrator/certs/existing-python-ca.pem || exit 1

sudo sh -ec '
  test -r /home/ztfadmin/approved-pe-ca.pem
  { cat /opt/ztf-orchestrator/certs/existing-python-ca.pem
    printf "\n"
    cat /home/ztfadmin/approved-pe-ca.pem
  } > /opt/ztf-orchestrator/certs/pe-ca-bundle.pem.new
  openssl crl2pkcs7 -nocrl -certfile /opt/ztf-orchestrator/certs/pe-ca-bundle.pem.new >/dev/null
  chmod 0644 /opt/ztf-orchestrator/certs/pe-ca-bundle.pem.new
  mv /opt/ztf-orchestrator/certs/pe-ca-bundle.pem.new /opt/ztf-orchestrator/certs/pe-ca-bundle.pem
'
```

## Merge the mount into the effective service configuration

Back up the host Compose file and `.env` securely first. On the appliance, the
update helper uses `/opt/ztf-orchestrator/appliance/docker-compose.appliance.yml`
explicitly. Merge into that file's existing service; a separately named override
is not applied unless every service/update invocation explicitly includes it.
Do not replace existing environment entries or persistent volumes.

```yaml
services:
  ztf-orchestrator:
    environment:
      SSL_CERT_FILE: /etc/ztf/pe-ca-bundle.pem
    volumes:
      - /opt/ztf-orchestrator/certs/pe-ca-bundle.pem:/etc/ztf/pe-ca-bundle.pem:ro
```

During an approved maintenance window with no active jobs or pipelines:

```bash
sudo docker compose --env-file /opt/ztf-orchestrator/.env \
  -f /opt/ztf-orchestrator/appliance/docker-compose.appliance.yml config --quiet

sudo docker compose --env-file /opt/ztf-orchestrator/.env \
  -f /opt/ztf-orchestrator/appliance/docker-compose.appliance.yml \
  up -d --no-deps --no-build --pull never --force-recreate ztf-orchestrator
```

This recreates only the application using its pinned local image. Preserve the
database and volumes. Do not post the full rendered Compose configuration: it can
include credentials. Reconfirm the custom mount after any Compose-file upgrade.

## Verify and recover

1. Confirm the app is healthy and the exact approved image is still running.
2. From `/opt/ztf-python/bin/python` inside the new container, confirm
   `SSL_CERT_FILE` and a TLS handshake with `ssl.create_default_context()` and
   `server_hostname` equal to the selected PE identity. This must succeed without
   disabling verification. A handshake does not prove API authorization.
3. Rerun read-only live drift or an independent user/role verifier. Then use
   CreateLocalUsersPe Dry Run for credential/schema checks before any separately
   approved mutation. Its Dry Run does not contact PE.
4. For rollback, restore the saved Compose/environment configuration and prior
   approved CA bundle, then recreate only the app using the same explicit files.
   Account changes already performed on PE are not reverted by Docker rollback.

Trust/validity, IP/SAN identity and network failures are separate causes. Follow
[local-user diagnostics](pe-local-users.md#failure-diagnostics) or
[live drift diagnostics](live-pe-drift-monitoring.md#connection-diagnostics).
No insecure bypass or automatic mutation retry is required.
