# Imaging Only Quick Guide

Guide ID: `QG-W-imaging-only` · Reviewed: 21 November 2026 · Source: `48eb875`

Status: Current source procedure. Read [Using the quick guides](../using-the-guides.md) first.

## Purpose

Images nodes without creating a cluster (bare metal prep).

## Prerequisites

Use the role authorized by the installed workflow policy. Complete the common preparation checklist, confirm service health and review the impact/recovery plan for this target.

## Required inputs

Configuration filename: `imaging_only.yml`. Foundation Central inventory, approved AOS/hypervisor images, target serials, IPMI credentials and imaging batch addressing.

## Procedure

1. Open Workflows 1.x → Imaging Only; confirm the ID is imaging-only.
2. Review each imaging batch and confirm the intent excludes cluster formation. Validate the YAML and authorize re-imaging of the exact nodes before Run Workflow.
3. Inspect the full generated/imported YAML, including optional settings and target scope. Save the reviewed file; perform the supported validation before submission.
4. Use the action's required approval and confirmation path. Submit once and follow Jobs / Queue plus any remote service task to its documented completion.

## Validation and expected result

Confirm the Foundation imaging task completes for every selected node; compare the installed images and serials with the approved batch.

## Failure and recovery

Imaging is destructive to existing node contents. This workflow does not prove cluster creation or application recovery; inspect Foundation state before a retry.

## Evidence to capture

Record the exact target, installed build, reviewed config filename/hash, approval if applicable, job/task/run IDs and redacted before/after checks. Keep unresolved follow-up with the change record.

## References

- [Detailed procedure](../../start-here.md)
- [Catalogue and details](../../../src/data.ts)
- [Execution form](../../../src/pages/WorkflowDetail.tsx)
- [Guide index](../README.md)

## Screen reference

![Imaging Only authoring screen with simulated data](../../assets/quick-guides/2026-11-21/workflows-imaging-only.png)

Simulated initial/authoring view captured 21 November 2026 from application source `48eb875`. State: **Configure / initial draft** at `/workflows/imaging-only`. Values are synthetic and required inputs may be incomplete. This is not evidence of a successful run, live target authentication or hardware compatibility. Lower form sections may be outside the captured viewport. Follow the preparation, approval, verification and recovery instructions.
