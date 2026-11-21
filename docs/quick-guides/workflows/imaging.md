# Pod Imaging Quick Guide

Guide ID: `QG-W-imaging` · Reviewed: 20 November 2026 · Source: `79c3ecc`

Status: Current source procedure. Read [Using the quick guides](../using-the-guides.md) first.

## Purpose

Pod workflow combining node imaging and cluster creation.

## Prerequisites

Use the role authorized by the installed workflow policy. Complete the common preparation checklist, confirm service health and review the impact/recovery plan for this target.

## Required inputs

Configuration filename: `pod-deploy.yml`. PC-associated Foundation Central endpoint, PC/CVM credential references, pod imaging parameters, approved image URLs and reviewed node scope.

## Procedure

1. Open Workflows 1.x → Pod Imaging; confirm the ID is imaging.
2. This entry uses the YAML editor. Replace its illustrative configuration with the installed framework's reviewed pod-deploy.yml structure. Check the complete pod scope before validation and approved execution.
3. Inspect the full generated/imported YAML, including optional settings and target scope. Save the reviewed file; perform the supported validation before submission.
4. Use the action's required approval and confirmation path. Submit once and follow Jobs / Queue plus any remote service task to its documented completion.

## Validation and expected result

Follow the underlying imaging and cluster tasks for every scoped site; record target serials, PE identities and completion evidence.

## Failure and recovery

The starter YAML is not a complete deployment design. Do not expand an untested batch across a pod; reconcile completed and still-running targets before retry.

## Evidence to capture

Record the exact target, installed build, reviewed config filename/hash, approval if applicable, job/task/run IDs and redacted before/after checks. Keep unresolved follow-up with the change record.

## Screen reference

![Pod Imaging authoring screen with simulated data](../../assets/quick-guides/2026-11-20/workflows-imaging.png)

Local demonstration of **Configure / initial draft** at `/workflows/imaging`, captured from source `79c3ecc` on 20 November 2026. Values and credential references are synthetic; required fields may intentionally be incomplete. This is the initial screen or selected configuration panel, not evidence of a successful run. Lower form sections may be outside the captured viewport. Follow this guide's preparation, approval and verification steps.

## References

- [Detailed procedure](../../start-here.md)
- [Catalogue and details](../../../src/data.ts)
- [Execution form](../../../src/pages/WorkflowDetail.tsx)
- [Guide index](../README.md)
