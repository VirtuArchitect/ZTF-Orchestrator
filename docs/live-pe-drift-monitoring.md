# Live Prism Element drift monitoring

Live PE monitoring compares approved DNS, NTP and Pulse settings with fresh
read-only API results on every manual, run-now and scheduled check. It does not
change Prism settings. Existing Last Applied and Stored Snapshot policies keep
their configuration-comparison behavior; they do not poll Prism.

## Configure a baseline

1. Add a credential reference in Global Config with a PE account authorized to
   read the three settings. Use the least privileges supported by your release.
   Never put a password in the drift policy or baseline.
2. Save a YAML configuration such as this example in Config Files:

```yaml
clusters:
  pe.example.com:
    pe_credential: pe_monitor
    name_servers_list:
      - 192.0.2.53
    ntp_servers_list:
      - ntp.example.com
    enable_pulse: false
```

3. In Drift Detection select the file, choose **Live Prism Element**, and run a
   check. Review every finding and any collection errors.
4. Add an Automation policy. Select **Live Prism Element**, set its UTC schedule,
   choose notification behavior and save it enabled. Use **Drift or unknown** to
   receive alerts for unavailable settings as well as differences. Notifications
   use the existing configured webhook; they require that webhook to be set up.
5. Use the pencil button (**Edit schedule**) to change the name, file, workflow
   scope, baseline, schedule, notification mode or enabled state. Saving updates
   the same policy and re-registers its schedule. Run it now to verify changes.

An explicit HTTPS endpoint with a custom port is also accepted as the cluster
key. Bare hosts/IPs use HTTPS port 9440. At most 16 clusters are accepted per
baseline. Every cluster needs a credential reference and at least one monitored
setting. Omitted settings are not monitored; an empty DNS/NTP list explicitly
requests no servers. Other configuration fields are neither compared nor saved
in live drift results. DNS/NTP order, duplicates, hostname case and trailing dots
are normalized. This is settings drift, not DNS/NTP service-health testing.

## Trust and API compatibility

TLS certificate and hostname verification are mandatory. Install your PE CA in
the appliance/container trust store, or mount a PEM CA bundle and configure
Python's `SSL_CERT_FILE`. Include the certificate chain and connect using a name
or IP present in the certificate SAN. There is no insecure TLS bypass.

The collector uses only GET requests to the installed ZTF legacy PE contracts:

- `/PrismGateway/services/rest/v1/cluster/name_servers` (JSON string array)
- `/PrismGateway/services/rest/v1/cluster/ntp_servers` (JSON string array)
- `/PrismGateway/services/rest/v1/pulse` (`enable` boolean)

Redirects and environment HTTP proxies are disabled to prevent credential
forwarding. Requests have a 10-second timeout and 1 MiB response limit.
Credentials are resolved afresh using the existing Global Config reference
lookup. No raw response bodies or credentials are retained in drift findings.
Admin and operator roles can collect and edit policies; viewers can read results.

Connection, TLS, authentication, unsupported response and parse failures produce
**Unknown** findings, not Matched. Confirmed differences remain **Drifted** even
when another setting is unknown; inspect the Unknown count and collection errors.
Each run records collection-start time, completion time and target endpoints.
Schedules persist through application restarts; missed downtime runs are not a
continuous-monitoring guarantee. No Prism Central collection or automatic
remediation is included.

## Acceptance test

On an authorized test cluster, establish a matched baseline, change one monitored
setting in Prism, wait for a scheduled run and verify the specific difference.
Restore the approved setting and verify a later fresh run matches. Test an
unreachable endpoint or insufficient permissions and verify Unknown. Restart
the appliance and confirm the enabled policy runs again. Validate these legacy
API response contracts on your installed AOS version before operational use.

Automated tests cover collection contracts, error handling, scheduling callbacks,
policy persistence/editing and UI flows using test doubles. They do not establish
live AOS compatibility or vendor support.
