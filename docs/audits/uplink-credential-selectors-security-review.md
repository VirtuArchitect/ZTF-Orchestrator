# Uplink credential selectors security review

Reviewed 22 November 2026. Scope: saved reference/username dropdowns in AHV Uplink Migration and the additive `GET /api/ahv-uplink-migration/credentials` catalogue. No execution API, approval policy, data schema, recovery algorithm or runtime dependency changes.

The catalogue requires the existing administrator role and returns `Cache-Control: no-store`. Its allowlisted response contains only reference and username strings. It follows active/local/cyberark declaration precedence used by the resolver, without resolving credentials or contacting secret providers. Passwords, tokens, provider paths and YAML parser diagnostics are excluded. Malformed data receives a generic error. Labels render as escaped React/native select text.

CVM choices match the backend's existing exact `nutanix` requirement. PE/PC selection is not authorization or authentication evidence; existing server validation still determines permissions. Loading/error/empty catalogues and missing selections cannot unlock discovery. Saved unavailable references remain visible without silent substitution. Reference changes and catalogue refresh after discovery invalidate inventory through the existing review path.

Focused checks cover metadata exclusion, precedence, administrator-only access, legacy fallback, malformed YAML, empty catalogues, state preservation, and absence of job submission. Mocked browser checks cover account labels, CVM filtering, error/empty/loading refresh, unavailable UUID/reference drafts, mobile layout and existing review/approval behavior. Network-disabled container tests verify catalogue behavior and the step 08-only recovery rehearsal.

No live cluster was contacted during this verification. Tests and local runtime preservation do not establish hardware compatibility or production acceptance. The complete appliance package is separately verified from the merged source before delivery.
