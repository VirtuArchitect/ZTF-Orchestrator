# NDB Deploy Quick Guide

Guide ID: `QG-W-ndb` · Reviewed: 20 November 2026 · Source: `79c3ecc`

Status: Current source procedure. Read [Using the quick guides](../using-the-guides.md) first.

## Purpose

Deploys and configures Nutanix Database Service.

## Prerequisites

Use the role authorized by the installed workflow policy. Complete the common preparation checklist, confirm service health and review the impact/recovery plan for this target.

## Required inputs

Configuration filename: `ndb.yml`. PE and NDB credentials, target cluster, NDB VM/image, network/static addressing and intended database-service profiles.

## Procedure

1. Open Workflows 1.x → NDB Deploy; confirm the ID is ndb.
2. Review the NDB form and resulting native YAML. Separate deployment from later initialization/registration and validate all dependencies before approved execution.
3. Inspect the full generated/imported YAML, including optional settings and target scope. Save the reviewed file; perform the supported validation before submission.
4. Use the action's required approval and confirmation path. Submit once and follow Jobs / Queue plus any remote service task to its documented completion.

## Validation and expected result

Verify NDB service health and the requested cluster/profile state; test database provisioning separately if it is in the acceptance plan.

## Failure and recovery

Do not infer database backup/recovery readiness from NDB deployment. Reconcile partial VM/service initialization before rerun.

## Evidence to capture

Record the exact target, installed build, reviewed config filename/hash, approval if applicable, job/task/run IDs and redacted before/after checks. Keep unresolved follow-up with the change record.

## Screen reference

![NDB Deploy authoring screen with simulated data](../../assets/quick-guides/2026-11-20/workflows-ndb.png)

Local demonstration of **Configure / initial draft** at `/workflows/ndb`, captured from source `79c3ecc` on 20 November 2026. Values and credential references are synthetic; required fields may intentionally be incomplete. This is the initial screen or selected configuration panel, not evidence of a successful run. Lower form sections may be outside the captured viewport. Follow this guide's preparation, approval and verification steps.

## References

- [Detailed procedure](../../user-guide.md)
- [Catalogue and details](../../../src/data.ts)
- [Execution form](../../../src/pages/WorkflowDetail.tsx)
- [Guide index](../README.md)
