# Documentation refresh verification - 2 November 2026

Application baseline: `a3c9c79832efe4552cab5b208d5fbe49936dcbf8`.
Consolidated application bundle: `v1.8.5-rc1-636f191` (unchanged).

- Administrator/User Guide: 147 pages, 79 inline illustrations; original page
  geometry, margins, typography, tables, headers/footers and landscape appendix retained.
- Recovery setup supplement: 9 pages; updated generic screenshots and source provenance.
- AHV appliance build guide: 5 pages; matching PDF added alongside editable Word.
- Refreshed 52 general guide captures, 14 README captures and 3 recovery setup
  captures from the implemented UI with isolated simulated records. Browser
  network guards prevented live backend, Foundation and Prism access. No deployment,
  password change, update, revocation or recovery was executed for these captures.
- Updated table of contents, manually reviewed rendered page/contact sheets and
  focused screenshots. Native Word export was used because LibreOffice was unavailable;
  PDF pages were rasterized for visual review.
- Added checksum/manifest regression checks; 39 focused documentation/release
  tests passed. Demo build and browser capture smoke checks passed.
- Active relative documentation links checked; historical archive/evidence records
  retain their original provenance. Historical videos were not re-recorded;
  the video index explicitly identifies newer controls absent from those videos.
- Security review: no runtime authorization, migration or API behavior changed.
  Screenshots use generic identities and example addresses. Group labels are not
  access boundaries; existing approvals, TLS checks and target verification remain.

This is documentation and simulated-media verification. It is not a target Linux
appliance update, physical deployment acceptance or vendor certification.
