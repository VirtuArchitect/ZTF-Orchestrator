# Upgrade Advisor TLS control illustration

Captured 3 November 2026 from the implemented UI in this change, using the
isolated Playwright API fixture in `tests/visual/upgrade-advisor.spec.ts`.
Addresses, credential references and inventory results are generic simulated
records. No PE/PC connection, credential submission or upgrade was performed.

The screenshot shows a reopened assessment whose PE inventory was collected
with verification disabled. The next-collection checkboxes have reset to enabled;
the amber warning correctly remains attached to the saved inventory evidence.
`SHA256SUMS` records the image digest. Reproduce with the existing Upgrade Advisor
visual tests against a local frontend preview.
