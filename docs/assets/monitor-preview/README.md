# Monitor and preview evidence screenshots

Captured on 1 November 2026 from the implemented frontend alongside this change,
using the existing Playwright browser fixtures at 1440 × 1050 in the light theme.
Records and sessions are isolated simulated data. No real appliance update,
cluster workflow or evidence-generation request was submitted.

- `monitor-verify.png`: consistent Monitor & Verify heading and execution-history
  shortcut in the primary cluster journey.
- `evidence-preview.png`: Advanced Automation navigation, NKP Validation Evidence
  Preview scope and the retained ZTF UAT pack source at the original route.

Reproduce with a loopback Vite development server and:

```sh
ZTF_VISUAL_BASE_URL=http://127.0.0.1:5173 npx playwright test tests/visual/start-here.spec.ts
```

Copy the two named captures from `test-results` only after inspecting them. These
screenshots document presentation and navigation, not live infrastructure health.
