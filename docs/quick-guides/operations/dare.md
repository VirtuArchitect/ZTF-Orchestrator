# Enable Data at Rest Encryption Quick Guide

Guide ID: `QG-O-dare` · Reviewed: 21 November 2026 · Source: `48eb875`

Status: Current source procedure. Read [Using the quick guides](../using-the-guides.md) first.

## Purpose

Enable cluster-wide software encryption using an already established Local KMS through the dedicated approved wizard.

## Prerequisites

Use an Orchestrator administrator. Complete the common preparation checklist and confirm the target/build and a reviewed recovery plan before any change.

## Required inputs

Administrator; expected cluster UUID and PE endpoint/credential; supported healthy 3–16 host AHV inventory reporting LKM, approved licensing and an off-appliance key-backup/recovery owner.

## Procedure

1. Open Configure → Enable Data-at-Rest Encryption (DARE). Select PE direct : no Prism Central for that transport. Keep certificate verification on, or follow its explicitly approved scoped exception procedure.
2. Run Discover cluster (read-only). Review complete membership, Good health, encryption readiness and existing LKM. Stop for external/PC key managers, drive encryption or ambiguous state; this wizard does not convert them.
3. Acknowledge licensing, irreversibility, exclusive change ownership and key recovery; record the change reference. Run Preflight and obtain approval from a different administrator for the exact hashed plan.
4. Packaged builds enable reviewed application by default; explicit false overrides retain planning mode. Only after representative lab validation and independent approval, type ENCRYPT followed by the cluster UUID and submit once.
5. Inspect the job and fresh configuration readback. Follow Prism's key-backup procedure and monitor background encryption separately.

## Validation and expected result

PE reports cluster-wide software encryption with LKM. Confirm encryption progress/completion and independently verify key backup/recoverability and workload acceptance.

## Failure and recovery

Software encryption cannot be disabled after enablement. Appliance rollback does not undo it. On uncertain submission/readback inspect PE state/tasks before any new request; never automatically retry.

## Evidence to capture

Record the exact target, installed build, reviewed config filename/hash, approval if applicable, job/task/run IDs and redacted before/after checks. Keep unresolved follow-up with the change record.

## References

- [Detailed procedure](../../dare-workflow.md)
- [Route and access controls](../../../src/App.tsx)
- [Guide index](../README.md)

## Screen reference

![Enable Data at Rest Encryption authoring screen with simulated data](../../assets/quick-guides/2026-11-21/operations-dare.png)

Simulated initial/authoring view captured 21 November 2026 from application source `48eb875`. State: **Configure / initial draft** at `/configure/dare`. Values are synthetic and required inputs may be incomplete. This is not evidence of a successful run, live target authentication or hardware compatibility. Lower form sections may be outside the captured viewport. Follow the preparation, approval, verification and recovery instructions.
