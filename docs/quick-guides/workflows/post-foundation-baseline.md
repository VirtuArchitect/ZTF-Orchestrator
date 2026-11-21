# Post-Foundation Baseline Quick Guide

Guide ID: `QG-W-post-foundation-baseline` · Reviewed: 21 November 2026 · Source: `48eb875`

Status: Current source procedure. Read [Using the quick guides](../using-the-guides.md) first.

## Purpose

Plans safe Prism Element day-1 settings after cluster creation.

## Prerequisites

Use the role authorized by the installed workflow policy. Complete the common preparation checklist, confirm service health and review the impact/recovery plan for this target.

## Required inputs

Configuration filename: `post-foundation-baseline.yml`. PE target/credentials; CVM access for health evidence; PC endpoint/credentials for registration; approved values for selected baseline controls.

## Procedure

1. Open Workflows 1.x → Post-Foundation Baseline; confirm the ID is post-foundation-baseline.
2. Enable only the needed controls. Review their apply/evidence/manual/blocked labels and generated plan. Validate health first, then approve applicable configuration changes.
3. Inspect the full generated/imported YAML, including optional settings and target scope. Save the reviewed file; perform the supported validation before submission.
4. Use the action's required approval and confirmation path. Submit once and follow Jobs / Queue plus any remote service task to its documented completion.

## Validation and expected result

Compare each applied setting in PE/PC and retain health evidence; a recorded checklist is not a successful mutation.

## Failure and recovery

Do not enable all controls to clear the checklist. Unsupported mappings remain blocked and manual controls require separate procedures.

## Evidence to capture

Record the exact target, installed build, reviewed config filename/hash, approval if applicable, job/task/run IDs and redacted before/after checks. Keep unresolved follow-up with the change record.

## References

- [Detailed procedure](../../pe-post-configuration-verification.md)
- [Catalogue and details](../../../src/data.ts)
- [Execution form](../../../src/pages/WorkflowDetail.tsx)
- [Guide index](../README.md)

## Screen reference

![Post-Foundation Baseline authoring screen with simulated data](../../assets/quick-guides/2026-11-21/workflows-post-foundation-baseline.png)

Simulated initial/authoring view captured 21 November 2026 from application source `48eb875`. State: **Configure / initial draft** at `/workflows/post-foundation-baseline`. Values are synthetic and required inputs may be incomplete. This is not evidence of a successful run, live target authentication or hardware compatibility. Lower form sections may be outside the captured viewport. Follow the preparation, approval, verification and recovery instructions.
