# PDF documentation library

The Pages site provides a shared PDF library at
<https://virtuarchitect.github.io/ZTF-Orchestrator/documentation/>.
The tutorial page and project navigation link to it. Nothing is uploaded by
visitors; all PDFs are selected from the repository documentation set.

`public/documentation/library.json` is the curated catalogue. Each entry records
its repository source, original PDF cover thumbnail, page count, size, SHA-256,
topic, edition and source-review boundary. Previous unbranded Quick Guide
editions are hidden until the reader enables **Include previous editions**.
Search matches titles, descriptions and topic keywords, not the full PDF text.
Use the browser PDF viewer's own Find command to search inside a guide.

Build the frontend, then package the library:

```sh
npm run build:demo -- --outDir dist-demo/demo
node scripts/build-documentation-library.mjs dist-demo/documentation
```

The Pages workflow moves the public library shell to the site root, then copies
the allowlisted source PDFs into `documentation/files/`. The packager checks
PDF signatures, repository containment and the recorded file hashes before
copying. A mismatch fails publication instead of silently publishing stale
metadata. `SHA256SUMS.txt` is generated from those verified files. PDFs remain
byte-identical; original cover pages, bookmarks and links are preserved.

When a guide changes, update its catalogue metadata and render its first page
as `public/documentation/covers/<id>.jpg`. Preserve its review provenance; a
format or download-link refresh does not establish a new content review.
Do not add environment-specific or confidential documents to the public set.

Links such as `?doc=illustrated-quick-guides` select a specific guide. Unknown
IDs select the default guide. Query strings never become file paths or HTML.
The viewer uses packaged same-origin PDFs, with separate open/download links
for mobile browsers and browsers without an embedded PDF viewer. JavaScript
or catalogue failures provide a repository-manuals fallback.

No runtime dependency, authentication, appliance or workflow behavior changes.

CI verifies PDF packaging in the frontend job, which supplies Node. The Python
integration test also runs where Node is installed and skips in Python-only
environments. Catalogue, review-boundary and navigation tests remain enabled.

## Verification: 21 November 2026

- `python -m pytest tests/test_documentation_library.py tests/test_quick_guides.py tests/test_documentation_media.py tests/test_release_integrity.py -q`: 49 passed.
- `npm run build` and `npm run build:demo -- --outDir dist-demo/demo`: passed. Existing large-chunk and unset non-demo placeholder warnings remain.
- `git diff --check` and `node --check` for the three new JavaScript modules: passed.
- `node scripts/smoke-documentation-library.mjs <local-documentation-URL> <screenshot-directory>`: all ten PDF responses were HTTP 200, PDF content types and SHA-256 matched; all covers and related tutorial links resolved. Search, empty results, topic filtering, archive selection, deep links, invalid-ID fallback, catalogue failure fallback and 390-pixel mobile focus/overflow checks passed. Native Chrome PDF preview and original cover were inspected visually.
- File/download review: repository-only source paths, fixed PDF IDs, same-origin viewer URLs, text-only DOM insertion, no visitor uploads, secrets or new dependencies. A PDF text scan found no supplied lab identifiers or private user paths; generic Windows placeholders and product names are retained.

These are local build and browser results. No production deployment or live
appliance validation was performed. Other browsers use their native PDF viewer;
the separate open/download links remain available when embedding is unsupported.
