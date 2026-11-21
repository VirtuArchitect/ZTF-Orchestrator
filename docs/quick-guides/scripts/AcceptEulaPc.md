# Accept EULA (PC) Quick Guide

Guide ID: `QG-S-AcceptEulaPc` · Reviewed: 20 November 2026 · Source: `79c3ecc`

Status: Current source procedure. Read [Using the quick guides](../using-the-guides.md) first.

## Purpose

Accepts the EULA in Prism Central.

## Prerequisites

Obtain authorization to accept the EULA and provide the actual accepting name/company/job title. Review Pulse participation independently.

## Required inputs

| Input in wizard | Form requirement | How to supply it |
|---|---|---|
| Prism Central IP (`pc_ip`) | Required | The intended service management address; confirm its identity. |
| PC Credential Ref (`pc_credential`) | Required | Exact saved reference in the selected Global Config vault; not a literal password. |
| EULA Username (`username`) | Required | Use the exact approved target value; review its generated YAML representation. |
| Company Name (`company_name`) | Required | Use the exact approved target value; review its generated YAML representation. |
| Job Title (`job_title`) | Optional in form | Use the exact approved target value; review its generated YAML representation. |
| Enable Pulse (`enable_pulse`) | Optional in form | Set deliberately to match the approved change; check the generated boolean. |

## Procedure

1. Open Scripts 1.x and select only Accept EULA (PC) (AcceptEulaPc).
2. Complete the required inputs, including operation-specific optional fields needed by your design. Select Generate YAML and review every target and value in the editor.
3. Run Dry Run where available and inspect its diagnostics. It does not prove the change will succeed on the target. Obtain the approvals required by the installed policy.
4. Submit the approved single-script scope once. Follow the terminal job/task results and perform the target checks below.

## Validation and expected result

Read back EULA acceptance and any explicitly requested Pulse state in the intended target.

## Failure and recovery

Acceptance has legal/organizational effect. Do not invent acceptance details or assume it configures other baseline settings.

## Evidence to capture

Record the exact target, installed build, reviewed config filename/hash, approval if applicable, job/task/run IDs and redacted before/after checks. Keep unresolved follow-up with the change record.

## Screen reference

![Accept EULA (PC) authoring screen with simulated data](../../assets/quick-guides/2026-11-20/scripts-AcceptEulaPc.png)

Local demonstration of **Single-script configuration wizard / authoring only** at `/scripts`, captured from source `79c3ecc` on 20 November 2026. Values and credential references are synthetic; required fields may intentionally be incomplete. This is the initial screen or selected configuration panel, not evidence of a successful run. Lower form sections may be outside the captured viewport. Follow this guide's preparation, approval and verification steps.

## References

- [Script wizard schema](../../../src/scriptConfigSchemas.ts)
- [Script execution UI](../../../src/pages/Scripts.tsx)
- [Common execution and recovery](../using-the-guides.md)
- [Guide index](../README.md)
