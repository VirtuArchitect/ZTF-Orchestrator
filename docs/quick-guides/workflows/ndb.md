# NDB Deploy Quick Guide

Guide ID: `QG-W-ndb` · Reviewed: 21 November 2026 · Source: `48eb875`

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

## References

- [Detailed procedure](../../user-guide.md)
- [Catalogue and details](../../../src/data.ts)
- [Execution form](../../../src/pages/WorkflowDetail.tsx)
- [Guide index](../README.md)

## Screen reference

![NDB Deploy authoring screen with simulated data](../../assets/quick-guides/2026-11-21/workflows-ndb.png)

Simulated initial/authoring view captured 21 November 2026 from application source `48eb875`. State: **Configure / initial draft** at `/workflows/ndb`. Values are synthetic and required inputs may be incomplete. This is not evidence of a successful run, live target authentication or hardware compatibility. Lower form sections may be outside the captured viewport. Follow the preparation, approval, verification and recovery instructions.
