# Delete VM (PC) Quick Guide

Guide ID: `QG-S-DeleteVmPc` · Reviewed: 21 November 2026 · Source: `48eb875`

Status: Current source procedure. Read [Using the quick guides](../using-the-guides.md) first.

## Purpose

Deletes virtual machines through Prism Central.

## Prerequisites

Confirm exact VM names and cluster identity against the approved inventory. Obtain a verified backup/restore plan and approval for VM and associated-disk loss.

## Required inputs

| Input in wizard | Form requirement | How to supply it |
|---|---|---|
| Prism Central IP (`pc_ip`) | Required | The intended service management address; confirm its identity. |
| PC Credential Ref (`pc_credential`) | Required | Exact saved reference in the selected Global Config vault; not a literal password. |
| VM Names (`vm_names`) | Required | Review the field separator and each exact entry before generation. |
| Cluster Name (`cluster_name`) | Required | Use the exact approved target value; review its generated YAML representation. |

## Procedure

1. Open Scripts 1.x and select only Delete VM (PC) (DeleteVmPc).
2. Complete the required inputs, including operation-specific optional fields needed by your design. Select Generate YAML and review every target and value in the editor.
3. Run Dry Run where available and inspect its diagnostics. It does not prove the change will succeed on the target. Obtain the approvals required by the installed policy.
4. To execute the approved single-script scope, enter exactly RUN DeleteVmPc when prompted, then submit once. Follow the terminal job/task results and perform the target checks below.

## Validation and expected result

Read fresh inventory to confirm only the named VMs were removed; check remaining workloads and storage.

## Failure and recovery

Deletion is destructive and not automatically reversible. Resolve dependencies without widening the target list; restore only through the approved backup procedure.

## Evidence to capture

Record the exact target, installed build, reviewed config filename/hash, approval if applicable, job/task/run IDs and redacted before/after checks. Keep unresolved follow-up with the change record.

## References

- [Script wizard schema](../../../src/scriptConfigSchemas.ts)
- [Script execution UI](../../../src/pages/Scripts.tsx)
- [Common execution and recovery](../using-the-guides.md)
- [Guide index](../README.md)

## Screen reference

![Delete VM (PC) authoring screen with simulated data](../../assets/quick-guides/2026-11-21/scripts-DeleteVmPc.png)

Simulated initial/authoring view captured 21 November 2026 from application source `48eb875`. State: **Single-script configuration wizard / authoring only** at `/scripts`. Values are synthetic and required inputs may be incomplete. This is not evidence of a successful run, live target authentication or hardware compatibility. Lower form sections may be outside the captured viewport. Follow the preparation, approval, verification and recovery instructions.
