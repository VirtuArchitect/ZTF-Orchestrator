# PE Network Baseline Quick Guide

Guide ID: `QG-W-pe-network-baseline` · Reviewed: 21 November 2026 · Source: `48eb875`

Status: Current source procedure. Read [Using the quick guides](../using-the-guides.md) first.

## Purpose

Plans Prism Element virtual switch and VM network settings.

## Prerequisites

Use the role authorized by the installed workflow policy. Complete the common preparation checklist, confirm service health and review the impact/recovery plan for this target.

## Required inputs

Configuration filename: `pe-network-baseline.yml`. PE target, saved credentials, exact network names and VLANs; complete managed IPAM values only when required.

## Procedure

1. Open Workflows 1.x → PE Network Baseline; confirm the ID is pe-network-baseline.
2. Select the mapped VM-network creation control. Review generated networks and compare the Create Subnet (PE) guide before execution. Keep virtual-switch/uplink/LACP intent separate.
3. Inspect the full generated/imported YAML, including optional settings and target scope. Save the reviewed file; perform the supported validation before submission.
4. Use the action's required approval and confirmation path. Submit once and follow Jobs / Queue plus any remote service task to its documented completion.

## Validation and expected result

Confirm each network's VLAN and requested IPAM properties in PE and test the intended guest connectivity.

## Failure and recovery

Virtual-switch descriptions, uplink intent and LACP have no safe mapping here. Prefix-only ip_config is invalid for the legacy subnet runtime; do not run that generated shape.

## Evidence to capture

Record the exact target, installed build, reviewed config filename/hash, approval if applicable, job/task/run IDs and redacted before/after checks. Keep unresolved follow-up with the change record.

## References

- [Detailed procedure](../../pe-post-configuration-verification.md)
- [Catalogue and details](../../../src/data.ts)
- [Execution form](../../../src/pages/WorkflowDetail.tsx)
- [Guide index](../README.md)

## Screen reference

![PE Network Baseline authoring screen with simulated data](../../assets/quick-guides/2026-11-21/workflows-pe-network-baseline.png)

Simulated initial/authoring view captured 21 November 2026 from application source `48eb875`. State: **Configure / initial draft** at `/workflows/pe-network-baseline`. Values are synthetic and required inputs may be incomplete. This is not evidence of a successful run, live target authentication or hardware compatibility. Lower form sections may be outside the captured viewport. Follow the preparation, approval, verification and recovery instructions.
