# Provisions the local WordPress backend. Idempotent — safe to re-run.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

docker compose up -d

# Wait for WordPress to respond over HTTP (any status incl. redirects counts)
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        Invoke-WebRequest -Uri "http://localhost:8080" -UseBasicParsing -TimeoutSec 5 | Out-Null
        $ready = $true; break
    } catch {
        if ($_.Exception.Response) { $ready = $true; break }
    }
    Start-Sleep -Seconds 2
}
if (-not $ready) { throw "WordPress did not become reachable on http://localhost:8080" }

docker compose run --rm wpcli wp core is-installed
if ($LASTEXITCODE -ne 0) {
    docker compose run --rm wpcli wp core install `
        --url=http://localhost:8080 `
        --title="Headless Store Dev" `
        --admin_user=admin `
        --admin_password=admin `
        --admin_email=admin@example.com `
        --skip-email
}

docker compose run --rm wpcli wp plugin install woocommerce wp-graphql --activate

docker compose run --rm wpcli wp plugin install `
    https://github.com/wp-graphql/wp-graphql-woocommerce/releases/latest/download/wp-graphql-woocommerce.zip --activate

# JWT auth — needed from Phase 6; soft-fail so Phase 0 stays green if the asset moves
docker compose run --rm wpcli wp plugin install `
    https://github.com/wp-graphql/wp-graphql-jwt-authentication/releases/latest/download/wp-graphql-jwt-authentication.zip --activate
if ($LASTEXITCODE -ne 0) {
    Write-Warning "wp-graphql-jwt-authentication install failed. Fallback (Phase 6): download the source zip from GitHub, run 'composer install --no-dev' inside the plugin folder, zip it, and install that zip."
} else {
    $secret = -join ((1..48) | ForEach-Object { '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'[(Get-Random -Maximum 62)] })
    docker compose run --rm wpcli wp config set GRAPHQL_JWT_AUTH_SECRET_KEY $secret --type=constant
}

docker compose run --rm wpcli wp plugin activate headless-bridge

docker compose run --rm wpcli wp option update permalink_structure "/%postname%/"
docker compose run --rm wpcli wp rewrite flush --hard

docker compose run --rm wpcli wp plugin list
Write-Host "`nDone. WP admin: http://localhost:8080/wp-admin (admin/admin) | GraphQL: http://localhost:8080/graphql"
