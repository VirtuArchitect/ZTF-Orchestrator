# PE health-reporting screenshot

Captured 5 November 2026, v1.8.5-rc1, using generic simulated browser fixtures. No live PE, PC or Foundation calls were made. Source baseline, candidate source hashes, viewport and image checksum are in capture-manifest.json. This capture is separate from older dated galleries.

Reproduce with ZTF_CAPTURE_HEALTH_GUIDE=1 and ZTF_VISUAL_BASE_URL set to a loopback development server, then run the health-status reference-view scenario in tests/visual/cluster-operations.spec.ts. Deliberately update provenance and checksums after recapture.
