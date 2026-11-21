# Deploy Management PC Quick Guide

Guide ID: `QG-W-deploy-management-pc` · Reviewed: 20 November 2026 · Source: `79c3ecc`

Status: Current source procedure. Read [Using the quick guides](../using-the-guides.md) first.

## Purpose

Deploys Prism Central and NCM management instances.

## Prerequisites

Use the role authorized by the installed workflow policy. Complete the common preparation checklist, confirm service health and review the impact/recovery plan for this target.

## Required inputs

Configuration filename: `pod-management-deploy.yml`. Management pod definition, target clusters and reviewed OVA/image/NCM lists plus required deployment credentials.

## Procedure

1. Open Workflows 1.x → Deploy Management PC; confirm the ID is deploy-management-pc.
2. Populate the management pod YAML with the installed framework's supported deployment objects. Review every new PC/NCM instance and avoid unintended duplicate names.
3. Inspect the full generated/imported YAML, including optional settings and target scope. Save the reviewed file; perform the supported validation before submission.
4. Use the action's required approval and confirmation path. Submit once and follow Jobs / Queue plus any remote service task to its documented completion.

## Validation and expected result

Verify PC/NCM deployment tasks, service access and intended management-plane membership independently.

## Failure and recovery

Empty starter lists deploy nothing useful. A VM inventory entry is not a healthy management service; reconcile existing instances before retry.

## Evidence to capture

Record the exact target, installed build, reviewed config filename/hash, approval if applicable, job/task/run IDs and redacted before/after checks. Keep unresolved follow-up with the change record.

## Screen reference

![Deploy Management PC authoring screen with simulated data](../../assets/quick-guides/2026-11-20/workflows-deploy-management-pc.png)

Local demonstration of **Configure / initial draft** at `/workflows/deploy-management-pc`, captured from source `79c3ecc` on 20 November 2026. Values and credential references are synthetic; required fields may intentionally be incomplete. This is the initial screen or selected configuration panel, not evidence of a successful run. Lower form sections may be outside the captured viewport. Follow this guide's preparation, approval and verification steps.

## References

- [Detailed procedure](../../user-guide.md)
- [Catalogue and details](../../../src/data.ts)
- [Execution form](../../../src/pages/WorkflowDetail.tsx)
- [Guide index](../README.md)
