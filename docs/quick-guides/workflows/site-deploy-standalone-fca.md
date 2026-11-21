# Site Deploy (Standalone FCA) Quick Guide

Guide ID: `QG-W-site-deploy-standalone-fca` · Reviewed: 20 November 2026 · Source: `79c3ecc`

Status: Current source procedure. Read [Using the quick guides](../using-the-guides.md) first.

## Purpose

Runs site deployment through standalone Foundation Central Appliance Lifecycle APIs.

## Prerequisites

Use the role authorized by the installed workflow policy. Complete the common preparation checklist, confirm service health and review the impact/recovery plan for this target.

## Required inputs

Configuration filename: `sites-deploy-fca.yml`. Standalone FCA endpoint/credential plus sites with reviewed networks, images and eligible node inventory.

## Procedure

1. Open Workflows 1.x → Site Deploy (Standalone FCA); confirm the ID is site-deploy-standalone-fca.
2. Review sites and run read-only Lifecycle preflight. After approval, enter RUN STANDALONE-FCA site-deploy-standalone-fca and retain each deployment ID.
3. Inspect the full generated/imported YAML, including optional settings and target scope. Save the reviewed file; perform the supported validation before submission.
4. Use the action's required approval and confirmation path. Submit once and follow Jobs / Queue plus any remote service task to its documented completion.

## Validation and expected result

Confirm terminal FCA status and independent PE health per deployed cluster; keep per-site results.

## Failure and recovery

FCA API/hardware compatibility is environment-specific. A local successful handoff does not prove all sites finished; reconcile remote tasks before retry.

## Evidence to capture

Record the exact target, installed build, reviewed config filename/hash, approval if applicable, job/task/run IDs and redacted before/after checks. Keep unresolved follow-up with the change record.

## Screen reference

![Site Deploy (Standalone FCA) authoring screen with simulated data](../../assets/quick-guides/2026-11-20/workflows-site-deploy-standalone-fca.png)

Local demonstration of **Configure / initial draft** at `/workflows/site-deploy-standalone-fca`, captured from source `79c3ecc` on 20 November 2026. Values and credential references are synthetic; required fields may intentionally be incomplete. This is the initial screen or selected configuration panel, not evidence of a successful run. Lower form sections may be outside the captured viewport. Follow this guide's preparation, approval and verification steps.

## References

- [Detailed procedure](../../foundation-central-validation.md)
- [Catalogue and details](../../../src/data.ts)
- [Execution form](../../../src/pages/WorkflowDetail.tsx)
- [Guide index](../README.md)
