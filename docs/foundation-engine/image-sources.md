# Native Foundation Image Sources

Current release marker: `v1.8.0`.

Image source manifest records AOS and hypervisor image references from a
`native-foundation-deploy` intent. It is a read-only provenance and checksum
review. It does not download images, read local files, compute disk checksums,
stage repositories, mount virtual media, image nodes, or create clusters.

## API

```text
POST /api/native-foundation/images/manifest
```

Request body:

```json
{
  "content": "<native-foundation-deploy YAML>"
}
```

## Intent Shape

Simple string references remain valid:

```yaml
aos_image: aos-image-ref
hypervisor_image: ahv-image-ref
```

For stronger review, use structured references:

```yaml
aos_image:
  source: http://images.example.invalid/aos.tar.gz
  version: "7.5.1.8"
  sha256: "<64 lowercase hex characters>"
hypervisor_image:
  source: http://images.example.invalid/ahv.iso
  version: "10.0"
  sha256: "<64 lowercase hex characters>"
```

## Checks

| Check | Purpose |
|---|---|
| `image-sources-declared` | Confirms AOS and hypervisor image references are present. |
| `image-sha256-present` | Confirms each image has a SHA256-shaped checksum. |
| `image-version-present` | Confirms each image declares a version. |
| `image-source-reuse-reviewed` | Shows when the same image source is reused. |
| `image-staging-disabled` | Always blocked in this release. |

## Boundary

The manifest helps operators collect image provenance before UAT. It does not
prove image reachability or content. Controlled UAT must verify source access,
checksum matching, version compatibility, and staging behavior before any
mutating image adapter can be enabled.
