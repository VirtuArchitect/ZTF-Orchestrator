# PDF Documentation Collection Maintenance

The public collection at <https://virtuarchitect.github.io/ZTF-Orchestrator/documentation/> brings maintained manuals, task procedures, runbooks, architecture, governance and API references into one searchable PDF library. Current guides and historical references are separate. A source snapshot is not a hardware validation result or an appliance update.

## Source and publication records

`public/documentation/library.json` controls titles, categories, document types, PDF paths, page counts, file sizes and SHA-256 checksums. `docs/manuals/current/collection-plan.json` selects Markdown sources for PDF export. The collection register records source dispositions, current input fingerprints and provided-document provenance. Private deployment packs and dated lab reports are not current public operating guidance.

Current PDFs record their Markdown and local-figure inputs. Text fingerprints normalise UTF-8 line endings to LF; binary sources use exact bytes. The packager rejects changed current inputs, mismatched PDF bytes, duplicate output filenames, invalid IDs and sources outside the documentation allowlist. Historical PDFs retain their recorded edition and byte checksum; their earlier source fingerprints are provenance rather than a requirement that the current checkout still contain identical text.

## Regenerate a Markdown PDF

Review the actual source and implementation first. Exporting text does not establish semantic freshness, target compatibility or approval. Record the reviewed application commit and date in the collection plan. Use an authoring toolkit with Node, marked, Playwright and Chrome, plus Python, pypdf and reportlab. These are authoring tools, not application runtime dependencies. Arial fonts are required to preserve the supplied guide format.

```powershell
$env:DOCUMENTATION_TOOL_MODULES = '<authoring toolkit>/node_modules'
$env:DOCUMENTATION_ARIAL_FONT = '<fonts>/arial.ttf'
$env:DOCUMENTATION_ARIAL_BOLD_FONT = '<fonts>/arialbd.ttf'
node scripts/documentation/render-markdown.cjs <document-id-fragment>
python scripts/documentation/update-markdown-pdfs.py --font $env:DOCUMENTATION_ARIAL_FONT
```

Omit the ID fragment to render the selected Markdown set. Render output defaults to `output/documentation-render`; `DOCUMENTATION_RENDER_DIR` selects another working directory. Raw HTML is escaped, figures are embedded from repository assets, external rendering requests are blocked and PDF links use public documentation or repository URLs. Sources and output IDs must remain inside the permitted boundaries.

The PDF updater retains the standard ZTF cover, Letter layout where applicable, Arial body text, navy tables and running furniture. A later dated edition preserves the earlier PDF as a historical entry. Inspect the rendered pages and links before publication. Frozen provided Word/PDF editions require their own source review and controlled export; they are not silently rewritten by this Markdown tool.

When a task PDF changes, rebuild the complete current task book:

```powershell
python scripts/documentation/build-task-book.py
```

This book combines common preparation and every current task body, adds a linked contents list and bookmarks, and applies continuous physical page numbering. Retired catalogue entries remain separate historical references. Update the source register and any new source dispositions before publication.

## Build and publish

```sh
npm run build:demo -- --outDir dist-demo/demo
node scripts/build-documentation-library.mjs dist-demo/documentation
```

The existing Pages workflow places the library beside the tutorials and copies verified PDFs into `documentation/files/`. It generates `SHA256SUMS.txt` and includes the collection register. No PDF regeneration occurs in the deployment job. Publication uses the protected main branch and required checks. A source branch or local build is not a live deployment.

## Required review

- Compare operating instructions, visible controls, routes and retained execution boundaries against the reviewed source. Keep Native Foundation Deploy distinct from the retired Native pipeline executor. NKP and ZTF 2.x console execution remain retired.
- Verify source hashes, all PDF responses, content types, sizes and byte checksums. Confirm the complete task book has the expected current task set and valid contents destinations.
- Render every changed PDF page, inspect layout and figures, check text preservation and reject authoring-machine or private paths in links and metadata.
- Use generic or simulated records. Label historical images and evidence. Preserve existing source documents and earlier editions.
- Exercise title/topic/type search, historical filtering, deep links, invalid-ID handling, empty results and catalogue failure fallback. Check keyboard and mobile-sized layouts.
- Verify the deployed source identity and actual PDF downloads after Pages publication. Test the embedded reader and keep independent Open PDF and Download PDF links available for browsers without embedding support.

The library is static and accepts no visitor uploads. Query strings select catalogue IDs and never become arbitrary viewer URLs or HTML. No runtime credentials, permissions, infrastructure write gates or application data are changed by documentation publication.
