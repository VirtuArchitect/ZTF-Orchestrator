# Air-Gapped Upgrade Checklist - v1.7.6

1. Copy ztf-update-v1.7.6.zip to approved transfer media.
2. Verify the ZIP SHA256 before importing.
3. Copy the ZIP to the air-gapped jump server.
4. Upload/import through Appliance Ops or the approved appliance update path.
5. Confirm the image loads as ghcr.io/virtuarchitect/ztf-orchestrator:v1.7.6.
6. Apply the update.
7. Confirm /health returns healthy and reports version 1.7.6.
8. Confirm the UI footer reports ZeroTouch Orchestrator v1.7.6.
9. Confirm Global Config contains a populated `foundation_central` credential.
10. Confirm the active connection profile uses the `foundation_central` Foundation Central credential reference.
11. Run a Cluster Create dry-run/preflight before executing against Foundation Central.
12. Retain the previous image for rollback until validation is complete.

