# PE health collection diagnostics security review

Scope: opt-in detailed errors on the shared inventory transport, used only by operational PE health collection.

- Preserve the two fixed GET paths, 10-second timeout, 1 MiB response bound, disabled redirects/proxies and verified HTTPS context. No health-collection TLS bypass or caller-controlled diagnostics option is added.
- Classify TLS/socket errors from exception types and OpenSSL numeric codes using the existing safe drift diagnostic helper. HTTP 401/403 receive separate fixed guidance; response bodies, reasons, URLs, passwords, authorization headers and raw exception text are never echoed.
- Only the application-authored PEReadError subtype is displayed specifically by the collector. Unclassified errors remain generic and fail closed. Credential lookup errors are replaced by safe guidance before transport creation.
- Existing administrator/operator collection permissions and viewer restrictions remain. Viewing records makes no PE calls; a failed read remains unknown/failed and never increments the fresh-Good count. Recovery, execution, approvals and review resolution are unchanged.
- The shared reader retains its existing generic messages by default, including the Upgrade Advisor TLS controls. Detailed collection is opt-in internally. No public request field, persisted schema migration, dependency or new log channel is introduced.
- Tests cover certificate trust/SAN/validity, bad trust configuration, DNS, timeout, refused/unreachable network, 401/403/status, malformed/oversize JSON, missing references, stage persistence, secret suppression and verified-GET boundaries. UI fixtures and isolated package smoke do not prove live PE connectivity or appliance-host cutover.
