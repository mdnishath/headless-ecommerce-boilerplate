# Seeds the apparel catalog into the running LocalWP 'ecommerce-backend' site.
# Idempotent: re-running updates existing seed products rather than duplicating.
$ErrorActionPreference = "Stop"
$seedFile = Join-Path $PSScriptRoot "seed-catalog.php"
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "wp.ps1") eval-file $seedFile
exit $LASTEXITCODE
