# Air-Gapped Upgrade Checklist - v1.6.0

1. Copy `ztf-update-v1.6.0.zip` to approved transfer media.
2. Verify the package checksum against the published `SHA256SUMS` entry before
   staging it on the appliance.
3. Confirm the current appliance has a restorable backup or snapshot before
   applying the update.
4. Import the package in Appliance Ops and verify it before staging.
5. Stage the update and allow the appliance first-boot/update service to apply
   the requested version.
6. Confirm `/health` returns `{"status":"healthy","version":"1.6.0"}` after
   the container is recreated.
7. Open the UI and confirm the footer reports `ZeroTouch Orchestrator v1.6.0`.
8. Review Upgrade Advisor Source Packs after upgrade. Re-import only curated,
   customer-owned advisory summaries and avoid storing secrets in rule text.
