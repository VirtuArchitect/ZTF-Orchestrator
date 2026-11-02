# v1.8.5-rc1 Screenshot Provenance

These 14 PNGs show the v1.8.5-rc1 frontend built from source using
`npm run build:demo`. All displayed infrastructure, jobs, approvals and
readiness records are **simulated demo data**, not live PE/PC or Foundation
observations, and not proof of production readiness or completed release UAT.

Capture date: 2026-11-02. Application revision:
`a3c9c79832efe4552cab5b208d5fbe49936dcbf8`.
Demo-only fixture corrections in this revision are included in the captures.
No backend execution behavior changes.

Viewport: 1600 x 1050, light theme. The visible UI
footer identifies v1.8.5-rc1. No historical screenshots were retouched or
relabeled. Earlier media remains separate from this gallery.

Dashboard now captures `/overview`, while Start Here, deployment guidance and
the post-configuration handoff have their own captures. See the
[complete manual gallery](../../guide/v1.8.5-rc1/README.md) for other current screens.

Reproduce with existing development dependencies:

```sh
npm run build:demo
npm run preview -- --mode demo --host 127.0.0.1 --port 15187 --strictPort
# In another terminal:
node scripts/capture_readme_screenshots.cjs
```

The capture helper only accepts a loopback demo URL and blocks external requests
and backend API requests. It does not log in to a live appliance or contact
infrastructure. `ZTF_CHROME_PATH` can select an installed Chromium browser;
`ZTF_SCREENSHOT_URL` can select another local preview port.

[Capture manifest and SHA256 hashes](capture-manifest.json).

Current grouping, scoped selection, PE title and progress illustrations use the
latest implemented UI with generic simulated fixtures. Supplement captures can
be reproduced with `node scripts/capture_current_operational_supplements.cjs`
after serving the local static demo on port 15221. See `capture-manifest.json`
and `SHA256SUMS` for per-image provenance.
