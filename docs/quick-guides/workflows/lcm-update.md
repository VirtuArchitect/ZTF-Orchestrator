# LCM Update Quick Guide

Guide ID: `QG-W-lcm-update` · Reviewed: 20 November 2026 · Source: `79c3ecc`

Status: Current source procedure. Read [Using the quick guides](../using-the-guides.md) first.

## Purpose

Runs lifecycle management update workflows.

## Prerequisites

Use the role authorized by the installed workflow policy. Complete the common preparation checklist, confirm service health and review the impact/recovery plan for this target.

## Required inputs

Configuration filename: `lcm-update.yml`. Reviewed lifecycle YAML matching the installed framework, cluster identity, fresh inventory, supported update targets and approved maintenance/recovery plan.

## Procedure

1. Open Workflows 1.x → LCM Update; confirm the ID is lcm-update.
2. This entry uses the YAML editor; its blank starter is not a runnable update configuration. Review vendor compatibility and inventory before requesting an approved update.
3. Inspect the full generated/imported YAML, including optional settings and target scope. Save the reviewed file; perform the supported validation before submission.
4. Use the action's required approval and confirmation path. Submit once and follow Jobs / Queue plus any remote service task to its documented completion.

## Validation and expected result

Follow target LCM tasks to completion, confirm exact component versions, rerun inventory and record cluster health.

## Failure and recovery

Lifecycle updates can disrupt service and may not be reversible. Do not retry from a local timeout until remote LCM state is known.

## Evidence to capture

Record the exact target, installed build, reviewed config filename/hash, approval if applicable, job/task/run IDs and redacted before/after checks. Keep unresolved follow-up with the change record.

## Screen reference

![LCM Update authoring screen with simulated data](../../assets/quick-guides/2026-11-20/workflows-lcm-update.png)

Local demonstration of **Configure / initial draft** at `/workflows/lcm-update`, captured from source `79c3ecc` on 20 November 2026. Values and credential references are synthetic; required fields may intentionally be incomplete. This is the initial screen or selected configuration panel, not evidence of a successful run. Lower form sections may be outside the captured viewport. Follow this guide's preparation, approval and verification steps.

## References

- [Detailed procedure](../../post-deployment-checks.md)
- [Catalogue and details](../../../src/data.ts)
- [Execution form](../../../src/pages/WorkflowDetail.tsx)
- [Guide index](../README.md)
