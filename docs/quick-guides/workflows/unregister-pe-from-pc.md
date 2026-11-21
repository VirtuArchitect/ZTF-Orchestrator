# Unregister PE from PC Quick Guide

Guide ID: `QG-W-unregister-pe-from-pc` · Reviewed: 21 November 2026 · Source: `48eb875`

Status: Current source procedure. Read [Using the quick guides](../using-the-guides.md) first.

## Purpose

Review and remove one exact PE registration from Prism Central.

## Prerequisites

Use an Orchestrator administrator. Complete the common preparation checklist, confirm service health and review the impact/recovery plan for this target.

## Required inputs

Configuration filename: `unregister-pe-from-pc.yml`. Trusted PC HTTPS endpoint on port 9440, selected-vault PC credential reference and exact PE cluster UUID; reviewed vendor dependencies.

## Procedure

1. Open Workflows 1.x → Unregister PE from PC; confirm the ID is unregister-pe-from-pc.
2. Select Look up target (read-only). Check captured PC UUID and PE name, acknowledge dependencies and obtain a different administrator's exact-YAML approval. Type UNREGISTER followed by the PE UUID and submit once.
3. Inspect the full generated/imported YAML, including optional settings and target scope. Save the reviewed file; perform the supported validation before submission.
4. Use the action's required approval and confirmation path. Submit once and follow Jobs / Queue plus any remote service task to its documented completion.

## Validation and expected result

A successful PC task and fresh PC inventory show the PE absent. Capture pcInventoryRemovalVerified, peSideCleanupVerified and followupRequired.

## Failure and recovery

PC-side removal does not prove PE cleanup or service health. Reconcile ambiguous tasks before another approval. This action cannot run through script composition, scheduling or pipelines.

## Evidence to capture

Record the exact target, installed build, reviewed config filename/hash, approval if applicable, job/task/run IDs and redacted before/after checks. Keep unresolved follow-up with the change record.

## References

- [Detailed procedure](../../unregister-pe-from-pc.md)
- [Catalogue and details](../../../src/data.ts)
- [Execution form](../../../src/pages/WorkflowDetail.tsx)
- [Guide index](../README.md)

## Screen reference

![Unregister PE from PC authoring screen with simulated data](../../assets/quick-guides/2026-11-21/workflows-unregister-pe-from-pc.png)

Simulated initial/authoring view captured 21 November 2026 from application source `48eb875`. State: **Configure / initial draft** at `/workflows/unregister-pe-from-pc`. Values are synthetic and required inputs may be incomplete. This is not evidence of a successful run, live target authentication or hardware compatibility. Lower form sections may be outside the captured viewport. Follow the preparation, approval, verification and recovery instructions.
