param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [string]$ZtfRef = "v1.5.2",
  [string]$ImageRepository = "ghcr.io/virtuarchitect/ztf-orchestrator",
  [switch]$SkipTests
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Script
  )
  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan
  $global:LASTEXITCODE = 0
  & $Script
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

if ($Version -notmatch '^v\d+\.\d+\.\d+$') {
  throw "Version must look like v1.5.6"
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$imageTag = "${ImageRepository}:${Version}"
$imageTar = Join-Path $repoRoot "ztf-orchestrator-$Version-image.tar"
$zipPath = Join-Path $repoRoot "ztf-update-$Version.zip"
$releaseNotes = Join-Path $repoRoot "release-notes-$Version.txt"
$installChecklist = Join-Path $repoRoot "install-checklist-$Version.md"

if (-not $SkipTests) {
  Invoke-Step "Run release integrity tests" {
    python -m pytest tests/test_release_integrity.py -q
  }
}

Invoke-Step "Build frontend" {
  npm run build
}

Invoke-Step "Build container image" {
  $env:DOCKER_BUILDKIT = "0"
  docker build --build-arg "ZTF_REF=$ZtfRef" -t $imageTag .
}

Invoke-Step "Smoke container health" {
  $name = "ztf-orchestrator-smoke-" + [guid]::NewGuid().ToString("N")
  docker run -d --name $name -e ZTF_STORAGE_BACKEND=file $imageTag | Out-Null
  try {
    $deadline = (Get-Date).AddSeconds(60)
    do {
      Start-Sleep -Seconds 2
      $content = docker exec $name curl -fsS http://127.0.0.1:5001/health 2>$null
      if ($LASTEXITCODE -eq 0 -and $content) {
        Write-Host $content
        return
      }
    } while ((Get-Date) -lt $deadline)
    docker logs $name
    throw "Container health smoke failed"
  } finally {
    docker rm -f $name | Out-Null
  }
}

Invoke-Step "Verify ZTF runtime patches" {
  $vmPatch = docker run --rm --entrypoint python $imageTag -c "from pathlib import Path; p=Path('/opt/zerotouch-framework/framework/scripts/python/helpers/v3/vm.py'); print('payload[\""spec\""][\""name\""] = kwargs[\""name\""]' in p.read_text())"
  if ($vmPatch.Trim() -ne "True") {
    throw "CreateVmsPc payload-name runtime patch not found"
  }
}

Invoke-Step "Export image tar" {
  Remove-Item $imageTar, $zipPath -Force -ErrorAction SilentlyContinue
  docker save $imageTag -o $imageTar
}

Invoke-Step "Create release notes and install checklist" {
  @"
ZTF-Orchestrator $Version

Image: $imageTag
Bundled ZTF ref: $ZtfRef
Built: $(Get-Date -Format o)

Verification:
- release integrity tests: $(-not $SkipTests)
- npm build: passed
- docker build: passed
- container /health: passed
- ZTF runtime patches: passed
"@ | Set-Content -Encoding UTF8 $releaseNotes

  @"
# Air-Gapped Upgrade Checklist - $Version

1. Copy `ztf-update-$Version.zip` to approved transfer media.
2. Verify the ZIP SHA256 before importing.
3. Copy the ZIP to the air-gapped jump server.
4. Upload/import through Appliance Ops or the approved appliance update path.
5. Confirm the image loads as `$imageTag`.
6. Apply the update.
7. Confirm `/health` returns `healthy`.
8. Confirm the UI footer reports `$Version`.
9. Run one non-destructive script wizard smoke test.
10. Retain the previous image for rollback until validation is complete.
"@ | Set-Content -Encoding UTF8 $installChecklist
}

Invoke-Step "Build offline update ZIP" {
  python .\scripts\build_offline_update_package.py --version $Version --image-tar $imageTar --output $zipPath
}

Invoke-Step "Verify ZIP contents and checksums" {
  python -m zipfile --list $zipPath
  Get-FileHash $zipPath, $imageTar, $releaseNotes, $installChecklist -Algorithm SHA256
}

Write-Host ""
Write-Host "Air-gapped release package ready:" -ForegroundColor Green
Write-Host "  $zipPath"
