# Initial Cluster Configuration

Configure Cluster (`config-cluster`) invokes the installed ZTF 1.x `ClusterConfig`
workflow. That workflow changes the default PE admin password first, then runs
EULA/Pulse and selected cluster operations. Do not precede it with the standalone
password-change script or treat it as an unrestricted repeatable Day-2 workflow.

## Procedure

1. In Global Config, create a credential reference for `admin` with the intended
   new password. Keep existing credentials until you verify successful login.
2. Open Configure Cluster. Add each PE VIP and optional cluster name. Enter the
   new PE admin credential reference; the form links the subsequent PE API
   credential reference to the same reference. Different clusters may use
   different references.
3. Leave Existing PE Admin Password Override blank for the shipped default. If
   supplied, it is a top-level value shared across targets and is stored as
   sensitive plaintext in YAML. Split targets with differing existing passwords
   into separate configurations. Never publish that YAML or screenshots of it.
4. Select Accept EULA only with authorization and provide the EULA name/company.
   Pulse offers Unchanged, Enabled and Disabled; Unchanged omits `enable_pulse`.
5. Add only the required DNS/NTP, data-services IP, HA, directory services,
   containers and VLANs. There are no automatically created containers/networks.
   HA and storage settings still require hardware/version compatibility review.
6. Review/download the YAML and run Dry Run. Password credentials intended for
   use after the change need not authenticate before the change. Dry Run is not
   evidence that a real password change or cluster configuration succeeded.
7. Run with the applicable approval. Verify new-password login, EULA/Pulse and
   selected settings independently in Prism. Update saved connection credentials.
   Inspect partial completion before retrying a failed or ambiguous run.

## Native Schema

The form preserves native imported per-cluster and additional settings when
editing. Invalid imports, legacy form keys and missing required fields are
reported instead of silently converted. New-password and directory service
passwords are credential references, not generated plaintext values.

| Setting | Native key |
| --- | --- |
| New admin password | `clusters.<VIP>.new_pe_admin_credential` |
| API credential after change | `clusters.<VIP>.pe_credential` |
| EULA | `eula.username`, `company_name`, `job_title` |
| Pulse | `enable_pulse` boolean; omit to leave unchanged |
| Directory service | `directory_services`, `ad_directory_url`, `service_account_credential` |
| Role mappings | `role_type`, `entity_type`, `values` |
| Storage | `containers`, `compression_enabled`, `on_disk_dedup: ON/OFF` |
| HA | `ha_reservation.enable_failover`, `num_host_failure_to_tolerate` |
| VLAN | `networks[].subnet_type: VLAN`, `vlan_id`, `ip_config` |
| IP pools | `ip_config.pool_list[].range`, using space-separated addresses |

Previous form keys `pulse`, `storage_containers`, `active_directory`, boolean
`ha_reservation` and flattened network addressing are not valid native inputs.
Correct them in the source YAML or recreate the configuration in the form.

The bundle applies an idempotent guard to the upstream role-mapping script so
omitting optional directory services does not dereference `None`.

## Pipelines And Validation

Where policy permits, save the generated configuration and select Configure
Cluster as one pipeline step. Approval-required workflows remain blocked from
pipelines and must use the direct approved-job path. No approval policy is changed
by this form correction.

Browser tests cover native generation, import/edit/export, submitted Dry Run
configuration and responsive layout. Runtime patch tests are isolated. No live
password change, EULA acceptance or cluster mutation is performed by these tests.
