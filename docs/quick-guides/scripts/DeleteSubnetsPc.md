# Delete Subnets (PC) Quick Guide

Guide ID: `QG-S-DeleteSubnetsPc` · Reviewed: 20 November 2026 · Source: `79c3ecc`

Status: Current source procedure. Read [Using the quick guides](../using-the-guides.md) first.

## Purpose

Removes network subnets from Prism Central.

## Prerequisites

Identify the exact network(s), cluster and VLAN where requested. Confirm no VM NICs, policies or other consumers still depend on them and retain a reviewed recreation plan.

## Required inputs

| Input in wizard | Form requirement | How to supply it |
|---|---|---|
| Prism Central IP (`pc_ip`) | Required | The intended service management address; confirm its identity. |
| PC Credential Ref (`pc_credential`) | Required | Exact saved reference in the selected Global Config vault; not a literal password. |
| Prism Element IP (`cluster_ip`) | Required | The intended service management address; confirm its identity. |
| PE Credential Ref (`pe_credential`) | Required | Exact saved reference in the selected Global Config vault; not a literal password. |
| Subnet Names (`subnet_names`) | Required | Review the field separator and each exact entry before generation. |

## Procedure

1. Open Scripts 1.x and select only Delete Subnets (PC) (DeleteSubnetsPc).
2. Complete the required inputs, including operation-specific optional fields needed by your design. Select Generate YAML and review every target and value in the editor.
3. Run Dry Run where available and inspect its diagnostics. It does not prove the change will succeed on the target. Obtain the approvals required by the installed policy.
4. To execute the approved single-script scope, enter exactly RUN DeleteSubnetsPc when prompted, then submit once. Follow the terminal job/task results and perform the target checks below.

## Validation and expected result

Read fresh subnet inventory and confirm only the intended subnet objects are absent; verify remaining guest connectivity.

## Failure and recovery

Never detach or delete dependent workloads just to clear a rejection. Resolve dependencies under a separate change and review partial deletion before retry.

## Evidence to capture

Record the exact target, installed build, reviewed config filename/hash, approval if applicable, job/task/run IDs and redacted before/after checks. Keep unresolved follow-up with the change record.

## Screen reference

![Delete Subnets (PC) authoring screen with simulated data](../../assets/quick-guides/2026-11-20/scripts-DeleteSubnetsPc.png)

Local demonstration of **Single-script configuration wizard / authoring only** at `/scripts`, captured from source `79c3ecc` on 20 November 2026. Values and credential references are synthetic; required fields may intentionally be incomplete. This is the initial screen or selected configuration panel, not evidence of a successful run. Lower form sections may be outside the captured viewport. Follow this guide's preparation, approval and verification steps.

## References

- [Script wizard schema](../../../src/scriptConfigSchemas.ts)
- [Script execution UI](../../../src/pages/Scripts.tsx)
- [Common execution and recovery](../using-the-guides.md)
- [Guide index](../README.md)
