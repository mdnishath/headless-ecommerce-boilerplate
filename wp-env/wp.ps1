# Thin WP-CLI wrapper for the LocalWP 'ecommerce-backend' site.
# Usage:  powershell -ExecutionPolicy Bypass -File wp-env\wp.ps1 <wp args...>
# Example: powershell -File wp-env\wp.ps1 plugin list --status=active
# Requires the site to be RUNNING (green) in the Local GUI.
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$WpArgs
)
$ErrorActionPreference = "Stop"

$SiteName = "ecommerce-backend"
$webRoot  = Join-Path $env:USERPROFILE "Local Sites\$SiteName\app\public"
if (-not (Test-Path $webRoot)) { throw "Site '$SiteName' not found at $webRoot" }

# Discover PHP + rendered php.ini from the running php-cgi process (mysqli/
# openssl/curl are only enabled via the per-site php.ini passed with -c).
$cgi = Get-CimInstance Win32_Process -Filter "Name='php-cgi.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -match '\s-c\s' }
if (-not $cgi) { throw "No running php-cgi.exe - start the '$SiteName' site (green) in Local first." }

$phpExe = $null; $iniDir = $null
foreach ($p in $cgi) {
    if ($p.CommandLine -match '"?(?<exe>[^"]*?php-cgi\.exe)"?\s.*\s-c\s+"?(?<ini>[^"]+?)"?\s*$') {
        $candExe = $matches['exe'] -replace 'php-cgi\.exe$', 'php.exe'
        $candIni = $matches['ini']
        $confRoot = Split-Path (Split-Path $candIni -Parent) -Parent
        $refsSite = Get-ChildItem $confRoot -Recurse -File -ErrorAction SilentlyContinue |
            Select-String -SimpleMatch -Pattern $SiteName -List -ErrorAction SilentlyContinue
        if ($refsSite -and (Test-Path $candExe)) { $phpExe = $candExe; $iniDir = $candIni; break }
        if (-not $phpExe -and (Test-Path $candExe)) { $phpExe = $candExe; $iniDir = $candIni }
    }
}
if (-not $phpExe) { throw "Could not derive PHP/php.ini from php-cgi for '$SiteName'." }

$wpCli = @(
    (Join-Path $env:LOCALAPPDATA "Programs\local\resources\extraResources\bin\wp-cli"),
    (Join-Path $env:APPDATA "Local\resources\extraResources\bin\wp-cli")
) | Where-Object { Test-Path $_ } |
    ForEach-Object { Get-ChildItem $_ -Recurse -Filter "*.phar" -ErrorAction SilentlyContinue } |
    Select-Object -First 1 -ExpandProperty FullName
if (-not $wpCli) { throw "wp-cli phar not found." }

# Drop the harmless optional-imagick startup warning; forward everything else.
& $phpExe -c $iniDir $wpCli --path="$webRoot" @WpArgs 2>&1 |
    Where-Object { $_ -notmatch 'php_imagick' -and $_ -notmatch 'PHP (Startup|Warning)' }
exit $LASTEXITCODE
