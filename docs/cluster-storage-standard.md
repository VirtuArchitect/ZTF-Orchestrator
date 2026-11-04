# Cluster Storage Standard

An administrator workflow under **Workflows 1.x → Configuration → Cluster Storage
Standard**. Run it separately after cluster deployment. It is not automatically
inserted into deployment or recovery pipelines.

Each cluster supplies its own three container names and settings. The workflow
creates missing containers, checks explicitly requested properties on all three,
then cleans up only the exact default container recorded during review. Existing
containers with mismatched settings cause failure; they are not modified.

## YAML

Replace these simulated values with the intended cluster's definitions. Credential
references resolve through the existing selected global vault; do not put passwords
in this YAML. The endpoint requires a trusted HTTPS certificate on port 9440.

```yaml
pe_endpoint: https://pe.example.com:9440
pe_credential: pe_admin_ref
containers:
  - name: SITE01-DATA
    replication_factor: 2
    compression_enabled: true
    on_disk_dedup: OFF
    erasure_code: OFF
  - name: SITE01-INFRA
    replication_factor: 2
    compression_enabled: true
  - name: SITE01-SERVICE
    replication_factor: 2
    compression_enabled: true
```

Exactly three distinct replacement names are required. Default and system names
are rejected. RF 1, 2 and 3 are accepted as intent values; support depends on the
cluster. Optional fields are `compression_delay_in_secs`, `finger_print_on_write`,
`advertisedCapacity_in_gb` and `reserved_in_gb`, in addition to those above. Disk
deduplication, fingerprinting and erasure-code switches accept `ON` or `OFF`.
Only explicitly supplied properties are verified. Multiple storage pools block
automatic placement; no pool is guessed.

## Review, approval and execution

1. Edit this cluster's YAML and optionally check its syntax locally or download it.
2. Select **Discover default (read-only)**. The server validates the intent, reads
   the PE cluster UUID and complete container inventory, and captures
   `expected_cluster_uuid` plus `expected_default: {name, uuid}` into the YAML.
   Discovery matches the entire `default-container-<digits>` name. Multiple
   matches, unsupported inventories and an unsuffixed `default-container` block
   review. Zero matches records `expected_default: null` explicitly.
3. Review identities, settings and dependencies; acknowledge prerequisites.
4. Request approval. A different administrator must approve this exact YAML and
   filename. Approval expires, cannot be disabled in Settings, and is single-use.
5. Type `APPLY STORAGE <cluster UUID>` and submit once. Follow the durable job;
   a browser disconnect is not a reason to resubmit.

The worker rechecks approval, cancellation/deadline and PE cluster identity before
writes. It validates existing replacements before creating any missing ones, then
reads back all three and verifies the requested properties. It rechecks the exact
reviewed default identity and complete VDisk inventory before deletion. The PE
also enforces deletion dependencies. Writes are submitted once, without force,
ignore-small-files overrides, disk deletion, migration, SSH fallback or retries.

Success requires fresh inventory proving the three replacements still match and
the default UUID/name are absent. `already_absent` is reported separately from
`deleted`. A default appearing after an absent review blocks execution.

## Blocked cleanup and partial changes

VDisk ownership pointing to the default, missing VDisk ownership evidence, or a PE
deletion rejection blocks cleanup and fails the job with a storage-specific reason.
It is not classified as a credential failure. Incomplete inventories and unverified
creation/removal also fail closed. The three replacements may already exist when
cleanup is blocked; no automatic rollback deletes them. Identify disk owners and
resolve their dependencies separately, inspect the resulting state, then obtain
new review/approval before another attempt. This workflow does not force the
container empty or delete workloads to satisfy the standard.

## Validation boundary

Native adapter uses the pinned framework's PE v1 container create/list/delete
contract and PE v2 cluster/VDisk inventory. Inventories must include a total count
matching the returned entity count; truncated or unsupported responses block the
workflow. This is conservative and may require compatibility work for another AOS
response shape. See the [Nutanix API guide](https://www.nutanix.dev/nutanix-api-user-guide/)
and the [PE API reference](https://www.nutanix.dev/api_reference/apis/prism_v2.html).

Automated tests use simulated PE responses. No live creation, deletion, disk
migration or vendor compatibility validation was performed for this addition.
