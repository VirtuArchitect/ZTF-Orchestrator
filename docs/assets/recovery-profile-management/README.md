# Recovery profile management screenshot

Captured 5 November 2026 from source `75ab11593e827bcc0e3238794dded96d20418d16`, version v1.8.5-rc1. This separate capture preserves the dated 2 November guide gallery and its manifest unchanged.

The screenshot uses generic simulated browser fixtures at 1440 x 1000 in the light theme. APIs are mocked; no real cluster, recovery run or deployment was contacted. Capture source and hashes are recorded in `capture-manifest.json` and `SHA256SUMS`.

Reproduce against the local development server with `ZTF_VISUAL_BASE_URL` set to its loopback URL and `ZTF_CAPTURE_PROFILE_GUIDE=1`, then run the archive-and-restore scenario in `tests/visual/disaster-recovery.spec.ts`. Re-captures require deliberate provenance and checksum updates.
