# v1.8.5-rc1 Screenshot Provenance

These eight PNGs show the v1.8.5-rc1 frontend built from source using
`npm run build:demo`. All displayed infrastructure, jobs, approvals and
readiness records are **simulated demo data**, not live PE/PC or Foundation
observations, and not proof of production readiness or completed release UAT.

Capture date: 2026-10-19. Viewport: 1600 x 1050, light theme. The visible UI
footer identifies v1.8.5-rc1. No historical screenshots were retouched or
relabeled. Earlier media remains separate from this gallery.

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
