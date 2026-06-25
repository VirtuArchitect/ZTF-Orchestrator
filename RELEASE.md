# Release Checklist

Use this checklist for ZTF-Orchestrator patch, minor, and appliance releases.

## 1. Choose the Version

- [ ] Decide the semantic version, for example `v1.5.1`.
- [ ] Confirm whether the release is a patch, minor, or major change.
- [ ] Confirm whether the release includes appliance, Docker, CI/CD, or
  security-sensitive changes.

## 2. Update Versioned Files

Keep these files aligned:

- [ ] `server.py`
- [ ] `src/version.ts`
- [ ] `package.json`
- [ ] `package-lock.json`
- [ ] `README.md`
- [ ] `CHANGELOG.md`

For appliance or operator-facing changes, also review:

- [ ] `docs/installation-guide.md`
- [ ] `docs/appliance-update-manager.md`
- [ ] `appliance/README.md`
- [ ] `.github/workflows/container-publish.yml`
- [ ] `.github/workflows/ahv-appliance-image.yml`

## 3. Update the Changelog

- [ ] Move completed entries out of `Unreleased`.
- [ ] Add the release date.
- [ ] Include `Summary`, `Added`, `Changed`, `Fixed`, and `Security` sections
  as applicable.
- [ ] Update the `Unreleased` wording so it references the new latest release.

## 4. Run Checks

Run targeted tests first, then broader checks based on risk.

Recommended backend check:

```bash
python -m pytest tests/ -v --cov=server --cov-report=term-missing --cov-fail-under=70
```

CI-like backend check:

```bash
docker run --rm \
  -v "$PWD:/work" \
  -w /work \
  -e ZTF_STORAGE_BACKEND=file \
  -e ZTF_DATABASE_URL= \
  -e POSTGRES_PASSWORD= \
  python:3.11-slim \
  bash -lc 'pip install -r requirements.txt pytest pytest-cov pip-audit defusedxml && pip-audit -r requirements.txt --ignore-vuln PYSEC-2024-271 && pytest tests/ -v --cov=server --cov-report=term-missing --cov-fail-under=70'
```

Frontend check:

```bash
npm ci
npm audit --audit-level=high
npm run build
```

Optional visual smoke:

```bash
ZTF_VISUAL_BASE_URL=http://127.0.0.1:5173 npm run smoke:visual
```

## 5. Smoke Test

- [ ] Start the app or container.
- [ ] Confirm `/health` returns success.
- [ ] Exercise the main changed workflow.
- [ ] For API changes, test one valid request and one invalid request.
- [ ] For appliance changes, document whether the smoke test used a staging
  appliance, local Docker, or code-level verification only.

## 6. Security Review

Use [SECURITY_REVIEW.md](SECURITY_REVIEW.md) when the release touches:

- [ ] Auth, sessions, roles, or permissions.
- [ ] User data, credentials, logs, or audit records.
- [ ] Uploads, downloads, archives, paths, subprocesses, or filesystem access.
- [ ] Webhooks, external callbacks, network clients, OAuth, or API keys.
- [ ] Dependencies, Docker, CI/CD, appliance, or deployment configuration.

Record the security notes in the pull request and release notes.

## 7. Tag and Publish

After checks pass on `main`:

```bash
git tag -a v1.5.1 -m "ZTF-Orchestrator v1.5.1"
git push origin v1.5.1
```

The tag push should trigger:

- [ ] Container publishing to GHCR.
- [ ] Any appliance artifact workflow configured for release tags.

Create or update the GitHub Release:

- [ ] Use the changelog content for the release notes.
- [ ] Link the full changelog comparison.
- [ ] Attach checksum or metadata assets if applicable.
- [ ] Do not attach multi-gigabyte QCOW2 artifacts directly to GitHub Releases
  when they exceed release asset limits.

## 8. Confirm GHCR Image

After the tag workflow completes, confirm the release image exists:

```bash
docker manifest inspect ghcr.io/virtuarchitect/ztf-orchestrator:v1.5.1
```

If the image is not available:

- [ ] Check the `Publish Container` workflow result.
- [ ] Confirm package permissions allow public or intended internal access.
- [ ] Document local-build/offline-package instructions as the supported update
  path until the GHCR tag is available.

For disconnected sites, build the image or QCOW2 in connected staging and import
it through the approved offline update package process.

## 9. Appliance Artifacts

For AHV appliance releases:

- [ ] Build standard, airgap, and minimal profiles as required.
- [ ] Generate SHA-256 checksums.
- [ ] Store large QCOW2 artifacts in GitHub Actions artifacts or the approved
  internal artifact repository.
- [ ] Publish checksum and manifest metadata.
- [ ] Verify first boot on a staging VM.
- [ ] Verify the Appliance Operations page and update manager.

## 10. Post-Release

- [ ] Confirm README version and release notes point to the latest release.
- [ ] Confirm Discussions or Announcements include release notes if needed.
- [ ] Confirm open issues or follow-ups are linked.
- [ ] Confirm any deployment caveats are documented.
