# Air-Gapped Upgrade Checklist - v1.7.7

1. Copy ztf-update-v1.7.7.zip to approved transfer media.
2. Verify the ZIP SHA256 before importing.
3. Copy the ZIP to the air-gapped jump server.
4. Upload/import through Appliance Ops or the approved appliance update path.
5. Confirm the image loads as ghcr.io/virtuarchitect/ztf-orchestrator:v1.7.7.
6. Apply the update.
7. Confirm /health returns healthy and reports version 1.7.7.
8. Confirm the UI footer reports ZeroTouch Orchestrator v1.7.7.
9. Confirm Global Config contains a populated `foundation_central` credential.
10. Confirm Cluster Create offers the Foundation Central target selector.
11. For integrated Prism Central Foundation Central, run a Cluster Create dry-run/preflight before executing.
12. For Standalone Foundation Central Appliance, confirm dry-run reports the compatibility boundary and use the FCA UI for deployment.
13. Retain the previous image for rollback until validation is complete.
