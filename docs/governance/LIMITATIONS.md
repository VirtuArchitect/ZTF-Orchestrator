# Limitations

Current release marker: `v1.7.10`.

This document records current product and validation limits that matter for
operator-controlled or production-assessable use.

## Current Limits

- Current workflow/script execution targets legacy ZeroTouch Framework 1.x.
- Native ZTF 2.x plan/apply is a future separate mode.
- YAML Studio does not execute workflows or mutate infrastructure.
- NKP apply/destructive behavior remains constrained.
- Production validation is environment-specific.
- Foundation Central create/imaging requires its own UAT lane.
- Prism Central category mutation had prior service-readiness limitations and
  should not be overclaimed without fresh target evidence.
- Disaster recovery requires deployment-specific RPO/RTO acceptance.

## Evidence Rule

Every capability claim must map to repository tests, simulator evidence, lab
evidence, controlled UAT evidence, or production validation evidence.
