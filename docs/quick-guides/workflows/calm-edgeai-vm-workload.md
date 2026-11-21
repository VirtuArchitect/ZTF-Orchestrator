# Edge AI Workload Quick Guide

Guide ID: `QG-W-calm-edgeai-vm-workload` · Reviewed: 21 November 2026 · Source: `48eb875`

Status: Current source procedure. Read [Using the quick guides](../using-the-guides.md) first.

## Purpose

Deploys Edge-AI application workloads.

## Prerequisites

Use the role authorized by the installed workflow policy. Complete the common preparation checklist, confirm service health and review the impact/recovery plan for this target.

## Required inputs

Configuration filename: `edge-ai.json`. Reviewed edge-ai.json blueprint, compatible Calm/DSL runtime, target project, images, network and required compute/accelerator capacity.

## Procedure

1. Open Workflows 1.x → Edge AI Workload; confirm the ID is calm-edgeai-vm-workload.
2. Use the configuration editor and installed framework's supported Edge AI payload; verify the complete blueprint and target before authorized launch.
3. Inspect the full generated/imported YAML, including optional settings and target scope. Save the reviewed file; perform the supported validation before submission.
4. Use the action's required approval and confirmation path. Submit once and follow Jobs / Queue plus any remote service task to its documented completion.

## Validation and expected result

Confirm application deployment tasks and workload-specific health, image versions and accelerator visibility where required.

## Failure and recovery

A catalogue entry does not establish hardware or application compatibility. Reconcile partial deployments using the approved blueprint procedure.

## Evidence to capture

Record the exact target, installed build, reviewed config filename/hash, approval if applicable, job/task/run IDs and redacted before/after checks. Keep unresolved follow-up with the change record.

## References

- [Detailed procedure](../../user-guide.md)
- [Catalogue and details](../../../src/data.ts)
- [Execution form](../../../src/pages/WorkflowDetail.tsx)
- [Guide index](../README.md)

## Screen reference

![Edge AI Workload authoring screen with simulated data](../../assets/quick-guides/2026-11-21/workflows-calm-edgeai-vm-workload.png)

Simulated initial/authoring view captured 21 November 2026 from application source `48eb875`. State: **Configure / initial draft** at `/workflows/calm-edgeai-vm-workload`. Values are synthetic and required inputs may be incomplete. This is not evidence of a successful run, live target authentication or hardware compatibility. Lower form sections may be outside the captured viewport. Follow the preparation, approval, verification and recovery instructions.
