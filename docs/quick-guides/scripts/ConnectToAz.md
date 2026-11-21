# Connect Availability Zone (PC) Quick Guide

Guide ID: `QG-S-ConnectToAz` · Reviewed: 21 November 2026 · Source: `48eb875`

Status: Current source procedure. Read [Using the quick guides](../using-the-guides.md) first.

## Purpose

Connects a remote availability zone for DR.

## Prerequisites

Review exact policy/plan/AZ identities, source and destination clusters, category scope, network mapping and supported RPO settings. Check existing replication and failover dependencies.

## Required inputs

| Input in wizard | Form requirement | How to supply it |
|---|---|---|
| Prism Central IP (`pc_ip`) | Required | The intended service management address; confirm its identity. |
| PC Credential Ref (`pc_credential`) | Required | Exact saved reference in the selected Global Config vault; not a literal password. |
| Remote PC IPs (`remote_pc_ips`) | Required | Review the field separator and each exact entry before generation. |
| Remote PC Credential Ref (`remote_pc_credential`) | Optional in form | Exact saved reference in the selected Global Config vault; not a literal password. |

## Procedure

1. Open Scripts 1.x and select only Connect Availability Zone (PC) (ConnectToAz).
2. Complete the required inputs, including operation-specific optional fields needed by your design. Select Generate YAML and review every target and value in the editor.
3. Run Dry Run where available and inspect its diagnostics. It does not prove the change will succeed on the target. Obtain the approvals required by the installed policy.
4. Submit the approved single-script scope once. Follow the terminal job/task results and perform the target checks below.

## Validation and expected result

Inspect the requested policy/plan/AZ state and underlying tasks. Verify replication/recovery readiness through a separate approved rehearsal.

## Failure and recovery

Configuration success does not establish achieved RPO/RTO or application recoverability. Delete/disconnect can remove protection; inspect dependencies and partial state before retry.

## Evidence to capture

Record the exact target, installed build, reviewed config filename/hash, approval if applicable, job/task/run IDs and redacted before/after checks. Keep unresolved follow-up with the change record.

## References

- [Script wizard schema](../../../src/scriptConfigSchemas.ts)
- [Script execution UI](../../../src/pages/Scripts.tsx)
- [Common execution and recovery](../using-the-guides.md)
- [Guide index](../README.md)

## Screen reference

![Connect Availability Zone (PC) authoring screen with simulated data](../../assets/quick-guides/2026-11-21/scripts-ConnectToAz.png)

Simulated initial/authoring view captured 21 November 2026 from application source `48eb875`. State: **Single-script configuration wizard / authoring only** at `/scripts`. Values are synthetic and required inputs may be incomplete. This is not evidence of a successful run, live target authentication or hardware compatibility. Lower form sections may be outside the captured viewport. Follow the preparation, approval, verification and recovery instructions.
