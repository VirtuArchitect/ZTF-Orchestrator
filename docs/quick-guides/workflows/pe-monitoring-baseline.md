# PE Monitoring Baseline Quick Guide

Guide ID: `QG-W-pe-monitoring-baseline` · Reviewed: 20 November 2026 · Source: `79c3ecc`

Status: Current source procedure. Read [Using the quick guides](../using-the-guides.md) first.

## Purpose

Plans Prism Element monitoring, alerting, and evidence checks.

## Prerequisites

Use the role authorized by the installed workflow policy. Complete the common preparation checklist, confirm service health and review the impact/recovery plan for this target.

## Required inputs

Configuration filename: `pe-monitoring-baseline.yml`. PE/CVM target and credentials; reviewed NCC evidence scope; monitoring design and contact information for manual tasks.

## Procedure

1. Open Workflows 1.x → PE Monitoring Baseline; confirm the ID is pe-monitoring-baseline.
2. Select NCC health evidence as needed. Review SMTP, alert contacts, SNMPv3 and syslog as manual or blocked controls; obtain their separate implementation procedure.
3. Inspect the full generated/imported YAML, including optional settings and target scope. Save the reviewed file; perform the supported validation before submission.
4. Use the action's required approval and confirmation path. Submit once and follow Jobs / Queue plus any remote service task to its documented completion.

## Validation and expected result

Retain fresh NCC results and distinguish checks performed from monitoring settings still needing manual application.

## Failure and recovery

A successful evidence step does not configure monitoring or prove alert delivery. Test actual delivery independently after an approved external configuration.

## Evidence to capture

Record the exact target, installed build, reviewed config filename/hash, approval if applicable, job/task/run IDs and redacted before/after checks. Keep unresolved follow-up with the change record.

## Screen reference

![PE Monitoring Baseline authoring screen with simulated data](../../assets/quick-guides/2026-11-20/workflows-pe-monitoring-baseline.png)

Local demonstration of **Configure / initial draft** at `/workflows/pe-monitoring-baseline`, captured from source `79c3ecc` on 20 November 2026. Values and credential references are synthetic; required fields may intentionally be incomplete. This is the initial screen or selected configuration panel, not evidence of a successful run. Lower form sections may be outside the captured viewport. Follow this guide's preparation, approval and verification steps.

## References

- [Detailed procedure](../../cluster-operations.md)
- [Catalogue and details](../../../src/data.ts)
- [Execution form](../../../src/pages/WorkflowDetail.tsx)
- [Guide index](../README.md)
