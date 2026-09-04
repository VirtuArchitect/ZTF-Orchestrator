# Native Foundation Network Manifest

Current release marker: `v1.8.1`.

Network manifest reviews declared site, cluster, and node addressing for a
`native-foundation-deploy` intent. It is a read-only IPAM and network metadata
check. It does not test reachability, reserve addresses, change VLANs, update
DNS/NTP, configure host or CVM networking, or create clusters.

## API

```text
POST /api/native-foundation/network/manifest
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>"
}
```

## Network Profile

Each site can declare:

```yaml
network_profile:
  management_subnet: 192.0.2.0/24
  management_gateway: 192.0.2.1
  management_vlan_id: 120
  dns_servers:
    - 192.0.2.53
  ntp_servers:
    - 192.0.2.123
```

More specific keys override the shared management values where needed:

- `bmc_subnet`, `bmc_gateway`, `bmc_vlan_id`
- `host_subnet`, `host_gateway`, `host_vlan_id`
- `cvm_subnet`, `cvm_gateway`, `cvm_vlan_id`

## Checks

| Check | Purpose |
|---|---|
| `network-profiles-present` | Confirms every site declares `network_profile`. |
| `dns-ntp-present` | Confirms every site declares DNS and NTP servers. |
| `ip-addresses-valid` | Confirms VIP, BMC, host, CVM, and gateway IPs parse. |
| `subnets-valid` | Confirms declared subnet values are valid CIDR values. |
| `ip-addresses-unique` | Detects duplicate VIP, BMC, host, and CVM addresses. |
| `subnet-membership-reviewed` | Checks addresses against declared site subnets where provided. |
| `network-configuration-disabled` | Always blocked in this release. |

## Boundary

The manifest validates declared metadata only. Controlled UAT must still prove
reachability from the execution environment, provider-specific VLAN/IPAM
behavior, Foundation network assumptions, DNS/NTP effects, and host/CVM network
configuration before any mutating network adapter can be enabled.
