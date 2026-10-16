# Nutanix Upgrade Risk Advisor

The Nutanix Upgrade Risk Advisor is a read-only pre-upgrade assessment surface
for ZTF-Orchestrator. It is designed to help operators decide whether a planned
Nutanix upgrade has enough evidence to proceed.

## Current Scope

- Optional verified-HTTPS PE cluster/host inventory reads and PC product-header
  detection, with explicit collection errors and timestamps.
- Immutable saved assessment snapshots and an actionable readiness table.
- Manual entry of current and target component versions.
- Bundled guardrail rules for LCM prechecks, release-note review,
  compatibility review, AOS major-version changes, Prism Central context,
  dark-site bundle review, and Community Edition manual review.
- API-driven assessment results with explicit findings, guidance, rule sources,
  missing evidence, and an overall status.
- Curated source packs that can be imported, enabled, disabled, and merged with
  bundled rules.
- Exportable evidence bundles containing the assessment JSON and a Markdown
  change-record summary.
- A UI page at `/upgrade-advisor`.
- No cluster mutation and no upgrade execution.

## Information Sources

The current implementation does not scrape or automatically query Nutanix KBs.
It uses three explicit inputs:

- **Operator-provided inventory**: current AOS, AHV, Prism Central, NCC, LCM,
  Foundation, firmware, edition, dark-site state, and feature/workload signals.
- **Operator-provided evidence flags**: whether LCM prechecks passed, release
  notes were reviewed, compatibility was reviewed, Prism Central context was
  captured, and dark-site bundle completeness was checked.
- **Bundled ZTF rules**: local YAML guardrails with source labels, source URLs,
  matching conditions, missing-evidence checks, severity, status, and guidance.

The intended known-issue source of truth is a curated rules pack maintained from
sources the operator is entitled to use:

- Nutanix public release notes and upgrade documentation.
- Nutanix Support Portal KBs, field advisories, and known/resolved issue notes
  exported or summarized by an authenticated customer/operator.
- Nutanix LCM inventory, recommendations, notifications, and precheck results.
- NCC output and cluster health evidence.
- Compatibility and interoperability matrix review results.
- Internal support cases, postmortems, customer incident notes, and local lab
  findings.

Future live collectors should fill the same request fields that the manual MVP
uses today. They should not bypass the rules pack or convert the advisor into an
automatic upgrade executor.

## Phased Implementation

1. **Manual read-only assessment**: implemented.
   Operators provide inventory, target versions, context, and evidence flags.

2. **Curated known-issue rules**: implemented as a local rules pack at
   `data/nutanix-upgrade-rules.yaml`.
   The bundled rules do not claim private Nutanix defect IDs. Customer-owned
   release-note, KB, advisory, and support-case facts can be added as curated
   rules with source references.

3. **Bounded Prism inventory enrichment**: implemented, pending target UAT.
   PE v2 cluster and host GET responses supply AOS and homogeneous AHV versions.
   PC version detection uses its HTTPS product header; it is not an authenticated
   API permission check. LCM, NCC, firmware and compatibility enrichment remain
   manual. Unsupported or incomplete responses remain Unknown.

## Operational procedure

1. Add read-capable PE/PC credential references in Global Config. Establish CA
   trust and matching certificate SAN identities. No insecure TLS mode exists.
2. Enter the PE and optional PC HTTPS endpoints and their credential references.
   Select Collect inventory. Only fixed GET paths are called, with ten-second
   timeouts, a 1 MiB response limit, no proxies and no redirect following.
3. Inspect timestamp, unknown components and collection errors. Mixed AHV
   versions and paginated host results require manual verification. Refresh
   clears prior current-version entries so old values are not silently reused.
4. Enter target versions and independently verified remaining current versions.
   Evidence flags remain operator declarations, not live LCM/NCC test results.
5. Run Assessment, review Readiness actions and their detailed sources, then Save
   assessment snapshot. Changed inputs require another assessment before saving.
6. Open a saved snapshot from the archive to resume review. Snapshots retain the
   exact input, server-computed result, creator and timestamp. Save again creates
   a new snapshot; it does not overwrite a previous review. Manual changes to
   collected values are recorded separately from the original observations.
7. Export retains the displayed assessment, rather than silently recomputing it
   against newer rules. It is advisory evidence, not an authorization to upgrade.

The API adds POST inventory, GET/POST assessments and GET assessments/{id}
under /api/upgrade-advisor. Collection and saving require admin/operator roles;
viewers can read shared saved assessments. Archives use the existing file or
PostgreSQL document backend without a schema migration. Each archive is limited
to 200 records; administrator retention review is required at that limit. There
is no automatic deletion. The in-process archive lock follows the application's
single-process worker model; multi-process writers are not supported by this
increment. Do not load-balance writable instances against this archive.

Inventory contains management endpoint identities and must be treated as
internal operational data. Credentials, arbitrary API bodies and transport error
details are not persisted. No environment was contacted during automated tests;
verify these response contracts on the installed AOS/PC versions before use.

## API

- `GET /api/upgrade-advisor/rules`
  Returns the active rules pack and implementation phases.

- `GET /api/upgrade-advisor/source-packs`
  Lists imported curated source packs.

- `POST /api/upgrade-advisor/source-packs`
  Imports a curated YAML/JSON source pack. Admins and operators can import
  packs. Viewers can only read them.

- `PUT /api/upgrade-advisor/source-packs/{pack_id}`
  Updates a source pack or toggles its `enabled` state.

- `DELETE /api/upgrade-advisor/source-packs/{pack_id}`
  Deletes a source pack. Admin only.

- `POST /api/upgrade-advisor/assess`
  Runs a read-only assessment.

- `POST /api/upgrade-advisor/export`
  Exports an assessment bundle with `assessment.json` and `assessment.md`.

Example request:

```json
{
  "inventory": {
    "clusterName": "Lab Cluster",
    "components": {
      "aos": "6.8.1",
      "ahv": "20230302.101026",
      "prismCentral": "2024.3"
    }
  },
  "targets": {
    "aos": "7.3.1"
  },
  "evidence": {
    "lcmPrecheck": "passed",
    "releaseNotesReviewed": true,
    "compatibilityReviewed": true,
    "prismCentralVersionCaptured": true
  },
  "context": {
    "edition": "enterprise",
    "darkSite": false,
    "features": ["Flow", "Files"]
  }
}
```

Overall statuses are `blocked`, `warning`, `review`, `unknown`, and `clear`.
The status is advisory evidence for change control, not a Nutanix support
certification.

## Source Pack Example

```yaml
name: Customer Upgrade Advisory Pack
version: 2026.08.customer
description: Customer-owned release-note, KB, advisory, or support-case findings.
rules:
  - id: customer-aos-target-review
    title: Customer advisory review required for this AOS target
    status: review
    severity: high
    match:
      targetComponents: [aos]
      component: aos
      targetVersion: ">=7.5.0,<7.6.0"
    message: Customer-owned advisory notes require explicit review for this target train.
    guidance: Confirm the advisory disposition in the change record before approving the maintenance window.
    source:
      label: Customer advisory summary
      url: ""
```

Source packs should contain summaries and references the operator is entitled to
store. Do not paste credentials, private support portal session data, or
unredacted customer secrets into rule text.
