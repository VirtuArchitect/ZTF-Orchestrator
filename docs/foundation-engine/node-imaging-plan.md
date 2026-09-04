# Native Foundation Node Imaging Plan

Current release marker: `v1.8.1`.

The node imaging plan turns a valid native Foundation intent into per-node
Foundation payload previews. It is a review artifact for future imaging UAT,
not an execution adapter.

## API

```text
POST /api/native-foundation/imaging/plan
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>",
  "discoveryFacts": {
    "sites": []
  }
}
```

`discoveryFacts` is optional and is used only to evaluate reconciliation
readiness. Valid intent returns `200` with a blocked read-only imaging plan.
Invalid intent returns `400`.

## Payload Preview

Each node plan includes:

- Site, cluster, provider, deployment type, and role.
- Node serial, BMC address, host IP, CVM IP where required, and cluster VIP.
- AOS and hypervisor image source and SHA256 metadata.
- A `canImage: false` execution boundary.

## Checks

| Check | Meaning |
| --- | --- |
| `image-sources-ready` | AOS and hypervisor image versions and SHA256 values are present. |
| `network-metadata-ready` | DNS, NTP, gateway, subnet, VIP, BMC, host, and CVM metadata pass read-only checks. |
| `credential-references-ready` | Required credential references are present and inline secrets are absent. |
| `discovery-reconciliation-reviewed` | Supplied discovery facts match intended nodes and include required inventory fields. |
| `imaging-payload-fields-complete` | Per-node payload previews include the required non-secret fields. |
| `node-imaging-disabled` | Imaging execution remains disabled. |

## Boundary

The endpoint does not stage images, verify images on disk, modify boot order,
mount virtual media, call BMCs, call Foundation, image nodes, or form clusters.
It exists so future imaging adapters have a deterministic, reviewable payload
contract before controlled hardware UAT.
