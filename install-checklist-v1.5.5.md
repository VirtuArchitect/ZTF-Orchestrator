# Air-Gapped Upgrade Checklist - v1.5.5

1. Copy ztf-update-v1.5.5.zip to approved transfer media.
2. Verify the ZIP SHA256 before importing.
3. Copy the ZIP to the air-gapped jump server.
4. Upload/import through Appliance Ops or the approved appliance update path.
5. Confirm the image loads as $imageTag.
6. Apply the update.
7. Confirm /health returns healthy.
8. Confirm the UI footer reports $Version.
9. Run one non-destructive script wizard smoke test.
10. Retain the previous image for rollback until validation is complete.
