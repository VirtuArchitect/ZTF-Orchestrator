# Public website navigation

The project landing page, documentation library, tutorials, releases and interactive demo share the menu in `src/public-site-navigation.json` and styles in `src/public-site-navigation.css`.

After changing the menu or its styles, run:

```sh
node scripts/build-public-navigation.mjs
node scripts/build-public-navigation.mjs --check
node --test tests/documentation-packaging.test.mjs
```

Commit the refreshed static HTML with its source. The demo imports the same source directly. Static pages embed the shared styles to retain standalone hosting and the script-free release page.

Home and the brand return to the project landing page. Section links return to its anchors. Public navigation appears only in demo mode, so the operational appliance keeps its existing navigation.

The visual smoke test is `tests/visual/public-site-navigation.spec.ts`. Run against the assembled Pages site with `ZTF_VISUAL_BASE_URL` pointing to its project root, including the trailing slash.
