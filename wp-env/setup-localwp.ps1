# Provisions the LocalWP backend site. Idempotent — safe to re-run.
# Prereq: the site exists and is RUNNING (green) in the LocalWP GUI
# (its PHP/MySQL services must be up — the script reads the running
# php-cgi process to discover the exact PHP binary + rendered php.ini).
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

# --- Discover PHP + the rendered php.ini from the RUNNING php-cgi process ---
# LocalWP's bundled PHP has no active php.ini of its own; the mysqli/openssl/
# curl extensions are only enabled via the per-site php.ini that LocalWP
# renders into its run directory and passes to php-cgi via `-c`. We therefore
# read the live php-cgi command line rather than guessing fixed paths (which
# differ across LocalWP versions — e.g. %APPDATA%\Local vs %LOCALAPPDATA%).
$cgi = Get-CimInstance Win32_Process -Filter "Name='php-cgi.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -match '\s-c\s' }
if (-not $cgi) {
    throw "No running php-cgi.exe found - start the '$SiteName' site (green) in the Local GUI first."
}

$phpExe = $null; $iniDir = $null
foreach ($p in $cgi) {
    # CommandLine: "...\php-cgi.exe -b 127.0.0.1:PORT -c <run>\<hash>\conf\php"
    if ($p.CommandLine -match '"?(?<exe>[^"]*?php-cgi\.exe)"?\s.*\s-c\s+"?(?<ini>[^"]+?)"?\s*$') {
        $candExe = $matches['exe'] -replace 'php-cgi\.exe$', 'php.exe'
        $candIni = $matches['ini']
        # Match this php-cgi to OUR site: its rendered nginx conf references the web root.
        $confRoot = Split-Path (Split-Path $candIni -Parent) -Parent   # ...\<hash>\conf
        $refsSite = Get-ChildItem $confRoot -Recurse -File -ErrorAction SilentlyContinue |
            Select-String -SimpleMatch -Pattern $SiteName -List -ErrorAction SilentlyContinue
        if ($refsSite -and (Test-Path $candExe)) { $phpExe = $candExe; $iniDir = $candIni; break }
        if (-not $phpExe -and (Test-Path $candExe)) { $phpExe = $candExe; $iniDir = $candIni } # fallback: first
    }
}
if (-not $phpExe -or -not $iniDir) {
    throw "Could not derive PHP + php.ini from the running php-cgi process for '$SiteName'."
}

# --- Locate the bundled WP-CLI phar (search both known LocalWP layouts) ---
$wpCli = @(
    (Join-Path $env:LOCALAPPDATA "Programs\local\resources\extraResources\bin\wp-cli"),
    (Join-Path $env:APPDATA "Local\resources\extraResources\bin\wp-cli")
) | Where-Object { Test-Path $_ } |
    ForEach-Object { Get-ChildItem $_ -Recurse -Filter "*.phar" -ErrorAction SilentlyContinue } |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $wpCli) { throw "LocalWP bundled wp-cli phar not found." }

Write-Host "PHP:     $phpExe"
Write-Host "php.ini: $iniDir"
Write-Host "WP-CLI:  $wpCli`n"

# Wp runs WP-CLI with the site's php.ini, dropping the optional-imagick
# startup warning so it doesn't masquerade as an error. $LASTEXITCODE after
# the call reflects php.exe (Where-Object is a cmdlet and doesn't change it).
function Wp {
    & $phpExe -c $iniDir $wpCli --path="$webRoot" @args 2>&1 |
        Where-Object { $_ -notmatch 'php_imagick' -and $_ -notmatch 'PHP (Startup|Warning)' }
}
function Wp-OrThrow {
    Wp @args
    if ($LASTEXITCODE -ne 0) { throw "wp $($args -join ' ') failed (exit $LASTEXITCODE)" }
}

# Idempotent: install only if missing, then always (re)activate.
function Ensure-Plugin([string]$Source, [string]$Slug, [bool]$Required) {
    Wp plugin is-installed $Slug *> $null
    if ($LASTEXITCODE -ne 0) {
        Wp plugin install $Source
        if ($LASTEXITCODE -ne 0) {
            if ($Required) { throw "Required plugin '$Slug' failed to install (exit $LASTEXITCODE)" }
            Write-Warning "Optional plugin '$Slug' failed to install (needed from Phase 6 - fallback: source zip + composer install)."
            return $false
        }
    }
    Wp plugin is-active $Slug *> $null
    if ($LASTEXITCODE -ne 0) { Wp-OrThrow plugin activate $Slug }
    return $true
}

# --- Sanity: WP + DB reachable ---
Wp-OrThrow core is-installed | Out-Null

# --- Junction the companion plugin into the site (live dev from the repo) ---
$pluginLink = Join-Path $webRoot "wp-content\plugins\headless-bridge"
$pluginSrc  = Join-Path $repoRoot "wp-plugin\headless-bridge"
if (-not (Test-Path $pluginLink)) {
    New-Item -ItemType Junction -Path $pluginLink -Target $pluginSrc | Out-Null
    Write-Host "Linked headless-bridge -> $pluginLink"
}

# --- Plugin stack (WooGraphQL required; JWT soft-fail, needed Phase 6) ---
Ensure-Plugin "woocommerce" "woocommerce" $true | Out-Null
Ensure-Plugin "wp-graphql"  "wp-graphql"  $true | Out-Null
Ensure-Plugin "https://github.com/wp-graphql/wp-graphql-woocommerce/releases/latest/download/wp-graphql-woocommerce.zip" "wp-graphql-woocommerce" $true | Out-Null

$jwtOk = Ensure-Plugin "https://github.com/wp-graphql/wp-graphql-jwt-authentication/releases/latest/download/wp-graphql-jwt-authentication.zip" "wp-graphql-jwt-authentication" $false
if ($jwtOk) {
    # Set the JWT secret only if not already defined (keeps the script idempotent).
    Wp config has GRAPHQL_JWT_AUTH_SECRET_KEY --type=constant *> $null
    if ($LASTEXITCODE -ne 0) {
        $secret = -join ((1..48) | ForEach-Object { '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'[(Get-Random -Maximum 62)] })
        Wp config set GRAPHQL_JWT_AUTH_SECRET_KEY $secret --type=constant *> $null
        if ($LASTEXITCODE -ne 0) { Write-Warning "Could not write GRAPHQL_JWT_AUTH_SECRET_KEY to wp-config.php (set it manually before Phase 6)." }
    }
}

Ensure-Plugin (Join-Path $repoRoot "wp-plugin\headless-bridge") "headless-bridge" $true | Out-Null
Wp-OrThrow option update permalink_structure "/%postname%/"
Wp-OrThrow rewrite flush

Write-Host "Active plugins:"
Wp plugin list --status=active --field=name
Write-Host ""
Write-Host "Done. WP admin: http://$SiteName.local/wp-admin (admin/admin) | GraphQL: http://$SiteName.local/graphql"
