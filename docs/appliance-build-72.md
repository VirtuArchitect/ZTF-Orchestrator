# Build #72 appliance downloads and deployment

Reviewed 26 November 2026. All three v1.8.5-rc1 release-candidate appliances use source
`f9eee7e5b7c15610b4f463818bda364c907e4fd3` and factory image version
`v1.8.5-rc1-f9eee7e5b7c1`.

| Profile | Verified QCOW2 download | First-boot requirements |
|---|---|---|
| Standard | [Build #72 Standard](https://github.com/VirtuArchitect/ZTF-Orchestrator/actions/runs/45857730316/artifacts/15140012194) | Application and PostgreSQL images are preloaded; tested without outbound connectivity. |
| Airgap | [Build #72 Airgap](https://github.com/VirtuArchitect/ZTF-Orchestrator/actions/runs/45857730316/artifacts/15139016921) | Preloaded images; disconnected bootstrap refuses missing images rather than pulling from a registry. |
| Minimal | [Build #72 Minimal](https://github.com/VirtuArchitect/ZTF-Orchestrator/actions/runs/45857730316/artifacts/15137946073) | Registry connectivity is required to fetch the exact source application image and PostgreSQL. |

[Successful build run](https://github.com/VirtuArchitect/ZTF-Orchestrator/actions/runs/45857730316).
These are GitHub Actions artifacts: sign in to GitHub to download, and retain a
verified local copy before artifact retention expires. They are not permanent
GitHub Release binary assets. Each download contains its QCOW2 and checksum file.
An offline application update ZIP updates an existing appliance; it is not a VM disk.

## Verify the download

Extract the complete artifact before uploading its QCOW2 to Prism. Compare the
disk hash with its included checksum and the independent values below. On Ubuntu:

```bash
sha256sum *.qcow2
```

| Profile | QCOW2 SHA-256 |
|---|---|
| Standard | `a28e6c2b3f52148c6942793090211e5914e84ad0f438ac625295b4a2996ef084` |
| Airgap | `37e9ae056b43ca1cee6cdd6c1ce4f00492cce0705545287ccffd85eb5c0a0d8e` |
| Minimal | `85e39bfaea7c84e0b44fde7b0fb06e1b1024ff945454064bb918480ea47e6695` |

[Download the consolidated checksum list](assets/appliance-build-72/SHA256SUMS-f9eee7e.txt)
([verification record](assets/appliance-build-72/Build-72-Verification.json)).

## First boot and deployment controls

1. Follow the [installation guide](installation-guide.md) to import the disk,
   configure management networking, and provision your administrator SSH public
   key before first power-on. Linux SSH and web-console accounts are separate.
2. Wait for the unmodified factory first-boot service to complete. Standard and
   Airgap reuse their verified local images. Minimal retrieves the exact source
   image; no profile silently substitutes a moving `main` or `latest` image.
3. Check the [first-boot identity commands](appliance-bootstrap-identity.md).
   Expect healthy application/PostgreSQL services and the versioned factory tag
   above. No manual image retag is needed for these rebuilt appliances.
4. Fresh first boot saves `ZTF_FOUNDATION_VM_ENABLE_MUTATION=true` in the private
   environment file. This permits reviewed deployment; it does not submit one.
   Administrator authorization, exact `DEPLOY FOUNDATION VM` confirmation,
   intent/preflight checks and configured workflow approvals remain enforced.
   Image-upload enablement is separate.
5. Preserve the environment and backup pair. Existing installations and explicit
   `false` overrides are unchanged by an update ZIP or a repeat first boot.
   Earlier Build #67 disks do not acquire these fixes by downloading this guide.

## Guided update and rollback readiness

Use **Administration > Appliance Ops > Updates** with a complete approved offline
ZIP. Review storage, check readiness, approve the exact version, then follow
backup, load, restart and verification. Retain the previous versioned image and
matching database/application-data backups. A bootstrap identity check is not an
executed guided install/rollback cycle. See [guided updates](guided-appliance-updates.md).

## Verification evidence and boundaries

All three downloaded disks matched their published SHA-256 and passed QCOW2
consistency checks. Disposable QEMU/KVM guests completed real factory systemd
bootstrap, ran healthy Docker/PostgreSQL services and retained configuration,
approval records and container identity after repeating first boot.

Twelve real HTTP checks per profile (36 total) covered unauthenticated requests,
exact confirmation, pending/missing approvals, self-approval rejection,
independent approval, changed-intent rejection and Operator/Viewer restrictions.
The jobs API remained empty; no request combined valid execution confirmation
with matching approved intent. Standard/Airgap had no outbound network; Minimal
used public registries only during bootstrap, then outbound access was blocked.

These results establish disposable-guest behavior, not AHV import, physical-node
imaging or production compatibility. No live cluster was changed. An actual
guided update/rollback on the target AHV VM remains a separate acceptance check.

## Related operating guidance

- [Administrator guide](admin-guide.md) and [User guide](user-guide.md).
- [Pipeline datacenter/cluster organization](pipeline-organization.md).
- [Workflow execution settings](workflow-execution-settings.md) and [PE TLS options](pe-tls-options.md).
- [Recovery workspace](disaster-recovery.md): preserve approvals, completed work
  and the eligible registration-only recovery retry.
- [Video currency notes](video-current-guidance.md): match dated recordings to
  the current written instructions before executing a change.
