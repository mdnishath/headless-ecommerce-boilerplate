# Provisions the LocalWP backend site. Idempotent — safe to re-run.
# Prereq: the site exists and is RUNNING (green) in the LocalWP GUI.
param(
    [string]$SiteName = "ecommerce-backend"
)
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path $PSScriptRoot -Parent
$siteRoot = Join-Path $env:USERPROFILE "Local Sites\$SiteName"
$webRoot  = Join-Path $siteRoot "app\public"
if (-not (Test-Path $webRoot)) {
    throw "LocalWP site '$SiteName' not found at $webRoot - create it in the Local GUI first (Task 8 Step 0)."
}

# --- Locate LocalWP's bundled PHP (newest) and WP-CLI ---
$lightning = Join-Path $env:LOCALAPPDATA "Programs\local\resources\extraResources\lightning-services"
$phpExe = Get-ChildItem (Join-Path $lightning "php-*") -Directory |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName "bin\win64\php.exe" } |
    Where-Object { Test-Path $_ } |
    Select-Object -First 1
if (-not $phpExe) { throw "LocalWP bundled php.exe not found under $lightning" }

$wpCliDir = Join-Path $env:LOCALAPPDATA "Programs\local\resources\extraResources\bin\wp-cli"
$wpCli = Get-ChildItem $wpCliDir -Recurse -Filter "*.phar" | Select-Object -First 1 -ExpandProperty FullName
if (-not $wpCli) { throw "LocalWP bundled wp-cli phar not found under $wpCliDir" }

function Invoke-Wp {
    & $phpExe $wpCli --path="$webRoot" @args
    if ($LASTEXITCODE -ne 0) { throw "wp $($args -join ' ') failed (exit $LASTEXITCODE)" }
}

# --- Sanity: WP + DB reachable (site must be running in the GUI) ---
& $phpExe $wpCli --path="$webRoot" core is-installed
if ($LASTEXITCODE -ne 0) {
    throw "WordPress/DB not reachable - is the '$SiteName' site started (green) in the Local GUI?"
}

# --- Junction the companion plugin into the site (live dev from the repo) ---
$pluginLink = Join-Path $webRoot "wp-content\plugins\headless-bridge"
$pluginSrc  = Join-Path $repoRoot "wp-plugin\headless-bridge"
if (-not (Test-Path $pluginLink)) {
    New-Item -ItemType Junction -Path $pluginLink -Target $pluginSrc | Out-Null
    Write-Host "Linked headless-bridge -> $pluginLink"
}

# --- Plugin stack ---
Invoke-Wp plugin install woocommerce wp-graphql --activate
Invoke-Wp plugin install https://github.com/wp-graphql/wp-graphql-woocommerce/releases/latest/download/wp-graphql-woocommerce.zip --activate

# JWT auth - needed from Phase 6; soft-fail so Phase 0 stays green if the asset moves
& $phpExe $wpCli --path="$webRoot" plugin install https://github.com/wp-graphql/wp-graphql-jwt-authentication/releases/latest/download/wp-graphql-jwt-authentication.zip --activate
if ($LASTEXITCODE -ne 0) {
    Write-Warning "wp-graphql-jwt-authentication install failed (needed from Phase 6 - fallback: source zip + composer install, see plan notes)."
} else {
    $secret = -join ((1..48) | ForEach-Object { '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'[(Get-Random -Maximum 62)] })
    & $phpExe $wpCli --path="$webRoot" config set GRAPHQL_JWT_AUTH_SECRET_KEY $secret --type=constant | Out-Null
}

Invoke-Wp plugin activate headless-bridge
Invoke-Wp option update permalink_structure "/%postname%/"
Invoke-Wp rewrite flush

Invoke-Wp plugin list
Write-Host ""
Write-Host "Done. WP admin: http://$SiteName.local/wp-admin (admin/admin) | GraphQL: http://$SiteName.local/graphql"
