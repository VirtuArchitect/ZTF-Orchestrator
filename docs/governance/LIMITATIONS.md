# Limitations

Current release marker: `v1.8.0`.

This document records current product and validation limits that matter for
operator-controlled or production-assessable use.

## Current Limits

- Workflows 1.x and Scripts 1.x execution target legacy ZeroTouch Framework 1.x.
- ZTF 2.x plan/apply is available only through the separate guarded ZTF 2.x IaC,
  Workflows 2.x, and Scripts 2.x lanes.
- Ungoverned ZTF 2.x apply/destroy and live resource behavior without
  environment-specific UAT remain out of scope.
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
