# Add NTP Servers (PE) Quick Guide

Guide ID: `QG-S-AddNtpServersPe` · Reviewed: 21 November 2026 · Source: `48eb875`

Status: Current source procedure. Read [Using the quick guides](../using-the-guides.md) first.

## Purpose

Adds NTP servers in Prism Element.

## Prerequisites

Supply approved NTP servers and confirm target-to-server reachability. Retain the existing list and time-health evidence.

## Required inputs

| Input in wizard | Form requirement | How to supply it |
|---|---|---|
| Prism Element IP (`cluster_ip`) | Required | The intended service management address; confirm its identity. |
| PE Credential Ref (`pe_credential`) | Required | Exact saved reference in the selected Global Config vault; not a literal password. |
| Cluster Name (`cluster_name`) | Required | Use the exact approved target value; review its generated YAML representation. |
| NTP Servers (`ntp_servers`) | Required | Review the field separator and each exact entry before generation. |

## Procedure

1. Open Scripts 1.x and select only Add NTP Servers (PE) (AddNtpServersPe).
2. Complete the required inputs, including operation-specific optional fields needed by your design. Select Generate YAML and review every target and value in the editor.
3. Run Dry Run where available and inspect its diagnostics. It does not prove the change will succeed on the target. Obtain the approvals required by the installed policy.
4. Submit the approved single-script scope once. Follow the terminal job/task results and perform the target checks below.

## Validation and expected result

Compare the configured NTP list and independently confirm synchronization/time health, not just server presence.

## Failure and recovery

Resolve reachability or server-health failures before changing more values; do not treat an accepted configuration as synchronized time.

## Evidence to capture

Record the exact target, installed build, reviewed config filename/hash, approval if applicable, job/task/run IDs and redacted before/after checks. Keep unresolved follow-up with the change record.

## References

- [Script wizard schema](../../../src/scriptConfigSchemas.ts)
- [Script execution UI](../../../src/pages/Scripts.tsx)
- [Common execution and recovery](../using-the-guides.md)
- [Guide index](../README.md)

## Screen reference

![Add NTP Servers (PE) authoring screen with simulated data](../../assets/quick-guides/2026-11-21/scripts-AddNtpServersPe.png)

Simulated initial/authoring view captured 21 November 2026 from application source `48eb875`. State: **Single-script configuration wizard / authoring only** at `/scripts`. Values are synthetic and required inputs may be incomplete. This is not evidence of a successful run, live target authentication or hardware compatibility. Lower form sections may be outside the captured viewport. Follow the preparation, approval, verification and recovery instructions.
