# Quick Guide Validation Record

Reviewed 20 November 2026 against application source
`79c3eccde1a0361ddfb49850e78c732217980f26`.

Address revision, 22 November 2026: current and historical collection downloads
now use documentation-only address examples, including embedded screenshots.
The validation findings below describe the original 20/21 November editions.
Original byte comparisons remain historical evidence; current checksums and
before-revision hashes are recorded separately in the publication manifests.
Original covers, layout, source labels and John Goulden attribution are retained.

## Cover and format correction on 21 November 2026

The corrected **Branded** editions restore the unchanged standard Operational
Quick Guides cover from the existing Multiple Cluster Deployment Planning guide.
The matching editable Initial Host/CVM Password Setup guide supplies the body
format: Letter portrait, Arial, 20 pt titles, 15 pt subheadings, 11 pt body,
Team Operational Quick Guides header, versioned footer and navy tables. The
cover is a separate full-page section with no footer. Inline screenshots retain
automatic line height so the reference's fixed text-line spacing cannot clip them.

The corrected outputs are **191 pages** for text, **308 pages** illustrated and
**123 pages** for the screenshot companion. Their contents and page fields were
refreshed in Microsoft Word. Every PDF page was rendered, with cover, body,
table and screenshot samples inspected. Checks verified Letter geometry, the
correct header/footer on every body page, no text or images outside the page,
resolved internal links, all 133 guide IDs in both full collections and all
117 task screenshots in the illustrated and companion editions. The exported
cover was compared with the actual reference cover render.

Editable procedures, captions, references and table values were compared with
the previous editions and are unchanged; only subject/edition labels, contents
page numbers and formatting differ. Longer tasks were balanced across pages to
avoid isolated evidence/reference continuations. All seven earlier Word/PDF/ZIP
downloads remain byte-identical to their existing manifests. Reference files and
the task screenshot PNGs remain unchanged.

`python -m pytest tests/test_quick_guides.py tests/test_release_integrity.py -q`
passed **35 tests**, including the standard cover, page-section geometry, font
sizes, page furniture, original-file preservation and embedded screenshot checks.
The [branding manifest](../manuals/workflow-script-quick-guides-branding.json)
and [corrected edition checksums](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Branded-SHA256SUMS.txt)
identify the exact files. This correction changes no runtime behaviour or
infrastructure; source review and simulated screenshot provenance remain dated
20 November 2026 at `79c3ecc`. No release or production-readiness status changes.

## Screenshot addition

The illustrated edition adds **117 matching task screenshots**, covering all
30 current workflows, 79 scripts and eight dedicated operations. The 16 retired
entries retain reference notes without current execution screenshots.

Screens were captured through the actual UI of an isolated local source demo,
with external requests blocked and no real backend connected. Synthetic
credential references and documentation addresses were entered in the script
forms; other visible values can be source-provided demonstration defaults or
placeholders. No Run, Apply, Dry Run, Discover or approval submission was invoked.
Each capture visibly states that its data is simulated and there is no live
execution. Some required fields are deliberately incomplete. Captures show the
initial screen or selected configuration panel; lower sections may be outside
the viewport. No runtime code or security setting was changed for the captures.

The [capture manifest](../assets/quick-guides/2026-11-20/capture-manifest.json)
binds each task ID to its route, state, PNG dimensions, source commit and SHA-256.
All 117 images were reviewed in contact sheets, with representative forms also
inspected at full size. The illustrated Word file embeds every image; a coverage
test verifies the PNG identities, hashes, guide links and embedded image bytes.

Microsoft Word refreshed the contents and exported the **279-page illustrated
PDF** and **122-page screenshot companion**. All pages were rendered; structural
checks found the expected 117 screenshot placements in each PDF, no text outside
the page bounds and no missing guide IDs in the full collection. Link checks
resolved internal destinations. Representative inserted-image pages were
inspected at full size. The original text-only Word and PDF hashes remain
unchanged. The [edition manifest](../manuals/workflow-script-quick-guides-screenshots.json)
and [checksums](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-Screenshots-SHA256SUMS.txt)
identify the new downloads. The PNG ZIP passed archive integrity checks.

`python -m pytest tests/test_quick_guides.py tests/test_release_integrity.py -q`
passed **34 tests** after adding screenshot coverage. Browser capture and gallery
checks establish UI/document delivery only; they do not validate target hardware
or live operations. The original text-edition validation record follows.

## Coverage and source review

- All 30 current workflow entries and 79 scripts in `src/data.ts` have individual guides.
- Eight dedicated operator flows have separate guides, including AHV uplinks,
  DARE, default-switch MTU, post-deployment, pipelines, recovery, appliance
  updates and Upgrade Advisor.
- Eight retired workflows and eight retired script entries have historical
  reference notes that explicitly prohibit following the retired execution path.
- All 508 script-wizard inputs were compared with `src/scriptConfigSchemas.ts`.
  The guides distinguish form-required fields from additional dependencies of
  the selected operation.
- Detailed workflow documents, execution forms, routes and post-cluster control
  modes were reviewed. Older documents' retired integration instructions do not
  override the current console retirement boundary.

## Automated checks

`python -m pytest tests/test_quick_guides.py tests/test_release_integrity.py -q`
passed **33 tests**. Coverage checks compare the actual catalogue IDs with the
manifest and index, check guide structure and local links, and parse the plain
VLAN example to ensure it has no incomplete IPAM block. `git diff --check` passed.

The local HTTP smoke test served the index, common preparation instructions
and all **133 individual guides** successfully. This verifies local document
delivery; it is not website publication or a workflow execution test.

## Word and PDF checks

The editable collection copies the maintained manual's portrait page system,
Arial typography and navy input-table design. Compact spacing and input guidance
suit the quick-guide format. Longer script guides separate preparation/inputs
from procedure and acceptance. The original manual remains unchanged.

Microsoft Word refreshed the contents and page fields and exported the matching
**162-page PDF**. Every PDF page was rendered and reviewed in contact sheets,
with representative input tables also inspected at full size. Text-bound checks
found no page overflow, all 133 guide IDs were present, and no reference-only or
blank continuation pages remained. PDF link checks examined **786 links** and
resolved their internal destinations. Local links are checked separately;
external vendor/service availability was not revalidated by these checks.

The [collection manifest](../manuals/workflow-script-quick-guides-collection.json)
and [SHA-256 sums](../manuals/ZTF-Orchestrator-Workflow-and-Script-Quick-Guides-SHA256SUMS.txt)
record the exact Word/PDF files.

## Security and operating limits

This is a documentation change. Runtime code, dependencies, authorization rules
and live-write gates are unchanged. Examples use generic identities and
documentation addresses. The review checked for private filesystem paths and
environment-specific IPs in the delivered text and document XML.

The instructions preserve credential references, independent SSH identity
verification, certificate trust, required approvals, irreversible-operation
warnings and reconciliation before retry. Password/session fields and exported
overrides are explicitly treated as sensitive. The plain-VLAN workaround is
documented; the subnet generator/runtime itself is not changed by this work.

No live cluster API, imaging, password rotation, network migration, encryption,
deletion, appliance installation or hardware compatibility validation was
performed. Check the installed build and applicable vendor contract before
operational use. Source review and simulated tests do not establish production
readiness, achieved RPO/RTO or application recovery.
