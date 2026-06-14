# Phase 1b: headless-bridge Pricing Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Pricing` module to `headless-bridge` that stores per-currency prices (regular + sale) on products and variations, edits them in the WooCommerce product-data admin UI, and exposes them via WPGraphQL as a `prices { currency, regular, sale }` list plus a `missingCurrencies` flag for the frontend's exchange-rate fallback.

**Architecture:** One PHP class `HeadlessBridge\Pricing` in `includes/class-pricing.php`, registered in the bootstrap's `plugins_loaded` list next to `I18n`. Prices live in post meta keyed `_hb_price_{CUR}_{regular|sale}` (e.g. `_hb_price_EUR_regular`). The configured currency list is an option (`hb_currencies`, default `['USD','EUR']`). Verification is pragmatic: `wp eval` to set meta + GraphQL queries to read it back.

**Tech Stack:** PHP 8.1, WooCommerce admin hooks (`woocommerce_product_options_pricing`, `woocommerce_variation_options_pricing`, `woocommerce_process_product_meta`, `woocommerce_save_product_variation`), WPGraphQL registration (`graphql_register_types`).

**Preconditions (all tasks):** LocalWP site `ecommerce-backend` running (green). WP-CLI via `powershell -ExecutionPolicy Bypass -File wp-env\wp.ps1 <args>`. GraphQL at http://ecommerce-backend.local/graphql (HTTP). Public GraphQL introspection is off — verify via live queries / WP-CLI, not `__type`. Plugin code is junction-linked (edits live). Phase 1a (i18n) is complete and must keep working.

---

### Task 1: Pricing class + currency config + bootstrap registration

**Files:**
- Create: `wp-plugin/headless-bridge/includes/class-pricing.php`
- Modify: `wp-plugin/headless-bridge/headless-bridge.php`

- [ ] **Step 1: Create `wp-plugin/headless-bridge/includes/class-pricing.php`**

```php
<?php

namespace HeadlessBridge;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Pricing module: per-currency regular/sale prices on products + variations,
 * an admin UI in the WooCommerce product-data panel, and GraphQL exposure.
 */
class Pricing
{
    /** Option holding the enabled currency codes. */
    public const CURRENCIES_OPTION = 'hb_currencies';

    /** Default currency list when the option is unset. */
    public const DEFAULT_CURRENCIES = ['USD', 'EUR'];

    /** Register all hooks for this module. */
    public function init(): void
    {
        // Hooks added by later tasks.
    }

    /** Enabled ISO-4217 currency codes (uppercase). */
    public function get_currencies(): array
    {
        $stored = get_option(self::CURRENCIES_OPTION, self::DEFAULT_CURRENCIES);
        if (!is_array($stored) || $stored === []) {
            $stored = self::DEFAULT_CURRENCIES;
        }
        return array_values(array_map('strtoupper', $stored));
    }

    /** Meta key for a currency's regular or sale price. $kind = 'regular'|'sale'. */
    public function meta_key(string $currency, string $kind): string
    {
        return '_hb_price_' . strtoupper($currency) . '_' . $kind;
    }
}
```

- [ ] **Step 2: Register the module in the bootstrap** — in `wp-plugin/headless-bridge/headless-bridge.php`

Change the require block + the `plugins_loaded` closure. The file currently has one `require_once` (i18n) and a closure that news up `I18n`. Replace those two pieces so both modules load:

Require block (after the existing i18n require):
```php
require_once HEADLESS_BRIDGE_DIR . 'includes/class-i18n.php';
require_once HEADLESS_BRIDGE_DIR . 'includes/class-pricing.php';
```

Closure body:
```php
add_action('plugins_loaded', static function (): void {
    (new \HeadlessBridge\I18n())->init();
    (new \HeadlessBridge\Pricing())->init();
});
```

- [ ] **Step 3: Verify the class loads + default currencies resolve**

```powershell
powershell -ExecutionPolicy Bypass -File wp-env\wp.ps1 eval "`$p=new HeadlessBridge\Pricing(); echo implode(',',`$p->get_currencies()).'|'.`$p->meta_key('eur','regular');"
```
Expected output: `USD,EUR|_hb_price_EUR_regular`

Confirm no fatal:
```powershell
powershell -ExecutionPolicy Bypass -File wp-env\wp.ps1 plugin list --status=active --field=name
```
Expected: still 5 active incl. `headless-bridge`.

- [ ] **Step 4: Commit**

```powershell
git add wp-plugin/headless-bridge/headless-bridge.php wp-plugin/headless-bridge/includes/class-pricing.php
git commit -m "feat(pricing): Pricing module skeleton, currency config, bootstrap registration"
```

---

### Task 2: Price storage helpers

**Files:**
- Modify: `wp-plugin/headless-bridge/includes/class-pricing.php`

- [ ] **Step 1: Append these methods inside the `Pricing` class**

```php
    /** Sanitise a price string to a decimal or '' (empty clears the price). */
    public function sanitize_price(string $value): string
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }
        // Accept comma or dot decimal separators; keep digits + one dot.
        $value = str_replace(',', '.', $value);
        return is_numeric($value) ? number_format((float) $value, 2, '.', '') : '';
    }

    /** Store (or clear, when '') a currency price on a post/variation. */
    public function set_price(int $post_id, string $currency, string $kind, string $value): void
    {
        $key   = $this->meta_key($currency, $kind);
        $clean = $this->sanitize_price($value);
        if ($clean === '') {
            delete_post_meta($post_id, $key);
        } else {
            update_post_meta($post_id, $key, $clean);
        }
    }

    /** Read a currency price, or '' if unset. */
    public function get_price(int $post_id, string $currency, string $kind): string
    {
        $val = get_post_meta($post_id, $this->meta_key($currency, $kind), true);
        return is_string($val) ? $val : '';
    }

    /**
     * All configured-currency prices for a post.
     * Returns a list of ['currency','regular','sale'] for currencies that have
     * a regular price set.
     */
    public function get_prices(int $post_id): array
    {
        $out = [];
        foreach ($this->get_currencies() as $cur) {
            $regular = $this->get_price($post_id, $cur, 'regular');
            if ($regular === '') {
                continue;
            }
            $out[] = [
                'currency' => $cur,
                'regular'  => $regular,
                'sale'     => $this->get_price($post_id, $cur, 'sale'),
            ];
        }
        return $out;
    }

    /** Configured currencies that have NO regular price on this post. */
    public function missing_currencies(int $post_id): array
    {
        $present = array_column($this->get_prices($post_id), 'currency');
        return array_values(array_diff($this->get_currencies(), $present));
    }
```

- [ ] **Step 2: Verify the helpers (set, read back, missing-flag) via eval**

```powershell
powershell -ExecutionPolicy Bypass -File wp-env\wp.ps1 eval '
$p = new HeadlessBridge\Pricing();
$id = wp_insert_post(["post_title"=>"PRICE test","post_status"=>"publish","post_type"=>"product"]);
$p->set_price($id,"USD","regular","19.99");
$p->set_price($id,"USD","sale","14.5");
$prices = $p->get_prices($id);
$missing = $p->missing_currencies($id);
$ok = (count($prices)===1 && $prices[0]["currency"]==="USD" && $prices[0]["regular"]==="19.99" && $prices[0]["sale"]==="14.50" && $missing===["EUR"]);
echo $ok ? "PRICE-OK" : "PRICE-FAIL";
wp_delete_post($id,true);
'
```
Expected output: `PRICE-OK`

- [ ] **Step 3: Commit**

```powershell
git add wp-plugin/headless-bridge/includes/class-pricing.php
git commit -m "feat(pricing): per-currency price storage helpers + missing-currency flag"
```

---

### Task 3: Admin UI — simple-product per-currency fields

**Files:**
- Modify: `wp-plugin/headless-bridge/includes/class-pricing.php`

- [ ] **Step 1: Hook the admin field render + save in `init()`**

Replace the `init()` body:
```php
    public function init(): void
    {
        add_action('woocommerce_product_options_pricing', [$this, 'render_simple_fields']);
        add_action('woocommerce_process_product_meta', [$this, 'save_simple_fields']);
    }
```

- [ ] **Step 2: Add the simple-product render + save methods**

```php
    /** Render per-currency price inputs in the product General > Pricing group. */
    public function render_simple_fields(): void
    {
        global $post;
        if (!$post) {
            return;
        }
        echo '<div class="hb-currency-prices">';
        foreach ($this->get_currencies() as $cur) {
            woocommerce_wp_text_input([
                'id'          => 'hb_price_' . $cur . '_regular',
                'label'       => sprintf('Regular price (%s)', $cur),
                'value'       => $this->get_price((int) $post->ID, $cur, 'regular'),
                'data_type'   => 'price',
                'desc_tip'    => true,
                'description' => sprintf('Headless storefront regular price in %s.', $cur),
            ]);
            woocommerce_wp_text_input([
                'id'          => 'hb_price_' . $cur . '_sale',
                'label'       => sprintf('Sale price (%s)', $cur),
                'value'       => $this->get_price((int) $post->ID, $cur, 'sale'),
                'data_type'   => 'price',
                'desc_tip'    => true,
                'description' => sprintf('Headless storefront sale price in %s.', $cur),
            ]);
        }
        echo '</div>';
    }

    /** Persist the per-currency price inputs for a simple product. */
    public function save_simple_fields(int $post_id): void
    {
        foreach ($this->get_currencies() as $cur) {
            foreach (['regular', 'sale'] as $kind) {
                $field = 'hb_price_' . $cur . '_' . $kind;
                if (isset($_POST[$field])) {
                    $this->set_price($post_id, $cur, $kind, sanitize_text_field(wp_unslash($_POST[$field])));
                }
            }
        }
    }
```

Note: WooCommerce calls `woocommerce_process_product_meta` only after its own nonce check, so an explicit nonce here would be redundant; the data is sanitised via `sanitize_price`.

- [ ] **Step 3: Verify the render method emits inputs for both currencies (no fatal, output contains the field ids)**

```powershell
powershell -ExecutionPolicy Bypass -File wp-env\wp.ps1 eval '
$id = wp_insert_post(["post_title"=>"RENDER test","post_status"=>"publish","post_type"=>"product"]);
$GLOBALS["post"] = get_post($id);
$p = new HeadlessBridge\Pricing();
ob_start(); $p->render_simple_fields(); $html = ob_get_clean();
$ok = (strpos($html,"hb_price_USD_regular")!==false && strpos($html,"hb_price_EUR_sale")!==false);
echo $ok ? "RENDER-OK" : "RENDER-FAIL";
wp_delete_post($id,true);
'
```
Expected output: `RENDER-OK`

(Optional manual check: open a product in `http://ecommerce-backend.local/wp-admin`, Product data → General; the "Regular price (USD)", "Sale price (USD)", "Regular price (EUR)", "Sale price (EUR)" fields appear under the native price fields.)

- [ ] **Step 4: Commit**

```powershell
git add wp-plugin/headless-bridge/includes/class-pricing.php
git commit -m "feat(pricing): simple-product per-currency admin fields + save"
```

---

### Task 4: Admin UI — variation per-currency fields

**Files:**
- Modify: `wp-plugin/headless-bridge/includes/class-pricing.php`

- [ ] **Step 1: Add the variation hooks to `init()`**

Append to `init()`:
```php
        add_action('woocommerce_variation_options_pricing', [$this, 'render_variation_fields'], 10, 3);
        add_action('woocommerce_save_product_variation', [$this, 'save_variation_fields'], 10, 2);
```

- [ ] **Step 2: Add the variation render + save methods**

```php
    /** Render per-currency price inputs inside a variation's pricing row. */
    public function render_variation_fields($loop, $variation_data, $variation): void
    {
        $vid = (int) $variation->ID;
        foreach ($this->get_currencies() as $cur) {
            woocommerce_wp_text_input([
                'id'            => 'hb_var_price_' . $cur . '_regular_' . $loop,
                'name'          => 'hb_var_price_' . $cur . '_regular[' . $loop . ']',
                'label'         => sprintf('Regular (%s)', $cur),
                'value'         => $this->get_price($vid, $cur, 'regular'),
                'data_type'     => 'price',
                'wrapper_class' => 'form-row form-row-first',
            ]);
            woocommerce_wp_text_input([
                'id'            => 'hb_var_price_' . $cur . '_sale_' . $loop,
                'name'          => 'hb_var_price_' . $cur . '_sale[' . $loop . ']',
                'label'         => sprintf('Sale (%s)', $cur),
                'value'         => $this->get_price($vid, $cur, 'sale'),
                'data_type'     => 'price',
                'wrapper_class' => 'form-row form-row-last',
            ]);
        }
    }

    /** Persist per-currency prices for a single variation row. */
    public function save_variation_fields(int $variation_id, int $loop): void
    {
        foreach ($this->get_currencies() as $cur) {
            foreach (['regular', 'sale'] as $kind) {
                $field = 'hb_var_price_' . $cur . '_' . $kind;
                if (isset($_POST[$field][$loop])) {
                    $this->set_price($variation_id, $cur, $kind, sanitize_text_field(wp_unslash($_POST[$field][$loop])));
                }
            }
        }
    }
```

- [ ] **Step 3: Verify the variation render emits per-currency inputs**

```powershell
powershell -ExecutionPolicy Bypass -File wp-env\wp.ps1 eval '
$prod = wp_insert_post(["post_title"=>"VAR parent","post_status"=>"publish","post_type"=>"product"]);
$var  = wp_insert_post(["post_title"=>"VAR child","post_status"=>"publish","post_type"=>"product_variation","post_parent"=>$prod]);
$p = new HeadlessBridge\Pricing();
ob_start(); $p->render_variation_fields(0, [], get_post($var)); $html = ob_get_clean();
$ok = (strpos($html,"hb_var_price_USD_regular[0]")!==false && strpos($html,"hb_var_price_EUR_sale[0]")!==false);
echo $ok ? "VAR-RENDER-OK" : "VAR-RENDER-FAIL";
wp_delete_post($var,true); wp_delete_post($prod,true);
'
```
Expected output: `VAR-RENDER-OK`

- [ ] **Step 4: Commit**

```powershell
git add wp-plugin/headless-bridge/includes/class-pricing.php
git commit -m "feat(pricing): variation per-currency admin fields + save"
```

---

### Task 5: GraphQL `prices` field on Product + ProductVariation

**Files:**
- Modify: `wp-plugin/headless-bridge/includes/class-pricing.php`

- [ ] **Step 1: Add the GraphQL hook to `init()`**

Append to `init()`:
```php
        add_action('graphql_register_types', [$this, 'register_graphql']);
```

- [ ] **Step 2: Add `register_graphql()`**

```php
    /** Register the HBPrice type + `prices` field on Product and ProductVariation. */
    public function register_graphql(): void
    {
        register_graphql_object_type('HBPrice', [
            'description' => 'A per-currency price.',
            'fields'      => [
                'currency' => ['type' => 'String', 'description' => 'ISO-4217 code.'],
                'regular'  => ['type' => 'String', 'description' => 'Regular price, decimal string.'],
                'sale'     => ['type' => 'String', 'description' => 'Sale price, decimal string, or empty.'],
            ],
        ]);

        foreach (['Product', 'ProductVariation'] as $gql_type) {
            register_graphql_field($gql_type, 'prices', [
                'type'        => ['list_of' => 'HBPrice'],
                'description' => 'Per-currency prices for the headless storefront.',
                'resolve'     => function ($source) {
                    return $this->get_prices((int) $source->ID);
                },
            ]);
        }
    }
```

- [ ] **Step 3: Seed a product with USD+EUR prices and capture its id**

```powershell
powershell -ExecutionPolicy Bypass -File wp-env\wp.ps1 eval '
$p = new HeadlessBridge\Pricing();
$id = wp_insert_post(["post_title"=>"GQL Price Tee","post_status"=>"publish","post_type"=>"product"]);
$p->set_price($id,"USD","regular","25.00"); $p->set_price($id,"USD","sale","19.99");
$p->set_price($id,"EUR","regular","23.00");
echo $id;
'
```
Capture the printed id as PRICE_ID.

- [ ] **Step 4: Verify via GraphQL (substitute PRICE_ID)**

```powershell
$pid = <PRICE_ID>
$body = "{`"query`":`"{ product(id: $pid, idType: DATABASE_ID) { name prices { currency regular sale } } }`"}"
Invoke-RestMethod -Uri "http://ecommerce-backend.local/graphql" -Method Post -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 8
```
Expected: `prices` is a 2-element list — `{currency:"USD",regular:"25.00",sale:"19.99"}` and `{currency:"EUR",regular:"23.00",sale:""}`. No `errors`.

- [ ] **Step 5: Clean up**

```powershell
powershell -ExecutionPolicy Bypass -File wp-env\wp.ps1 eval 'foreach (get_posts(["post_type"=>"product","post_status"=>"any","posts_per_page"=>-1,"fields"=>"ids","s"=>"GQL Price Tee"]) as $p) { wp_delete_post($p,true); } echo "CLEANED";'
```
Expected: `CLEANED`

- [ ] **Step 6: Commit**

```powershell
git add wp-plugin/headless-bridge/includes/class-pricing.php
git commit -m "feat(pricing): expose per-currency prices via WPGraphQL on Product + ProductVariation"
```

---

### Task 6: GraphQL `missingCurrencies` flag

**Files:**
- Modify: `wp-plugin/headless-bridge/includes/class-pricing.php`

Lets the frontend know which configured currencies lack an explicit price (so it can apply exchange-rate fallback in Phase 3).

- [ ] **Step 1: Register the field — append inside `register_graphql()` after the `prices` loop**

```php
        foreach (['Product', 'ProductVariation'] as $gql_type) {
            register_graphql_field($gql_type, 'missingCurrencies', [
                'type'        => ['list_of' => 'String'],
                'description' => 'Configured currencies with no explicit price (frontend applies fallback).',
                'resolve'     => function ($source) {
                    return $this->missing_currencies((int) $source->ID);
                },
            ]);
        }
```

- [ ] **Step 2: Seed a USD-only product and capture its id**

```powershell
powershell -ExecutionPolicy Bypass -File wp-env\wp.ps1 eval '
$p = new HeadlessBridge\Pricing();
$id = wp_insert_post(["post_title"=>"GQL Missing Tee","post_status"=>"publish","post_type"=>"product"]);
$p->set_price($id,"USD","regular","30.00");
echo $id;
'
```
Capture as MISS_ID.

- [ ] **Step 3: Verify via GraphQL (substitute MISS_ID)**

```powershell
$mid = <MISS_ID>
$body = "{`"query`":`"{ product(id: $mid, idType: DATABASE_ID) { prices { currency } missingCurrencies } }`"}"
Invoke-RestMethod -Uri "http://ecommerce-backend.local/graphql" -Method Post -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 8
```
Expected: `prices` has one entry (`USD`); `missingCurrencies` is `["EUR"]`. No `errors`.

- [ ] **Step 4: Clean up**

```powershell
powershell -ExecutionPolicy Bypass -File wp-env\wp.ps1 eval 'foreach (get_posts(["post_type"=>"product","post_status"=>"any","posts_per_page"=>-1,"fields"=>"ids","s"=>"GQL Missing Tee"]) as $p) { wp_delete_post($p,true); } echo "CLEANED";'
```
Expected: `CLEANED`

- [ ] **Step 5: Commit**

```powershell
git add wp-plugin/headless-bridge/includes/class-pricing.php
git commit -m "feat(pricing): expose missingCurrencies flag via WPGraphQL"
```

---

## Phase 1b Definition of Done

- `Pricing::get_currencies()` returns `[USD, EUR]`; `meta_key()` correct.
- Storage helpers verified (PRICE-OK).
- Admin fields render for simple products (RENDER-OK) and variations (VAR-RENDER-OK).
- GraphQL: `product { prices { currency regular sale } }` returns per-currency prices; `missingCurrencies` lists configured currencies without a price.
- `headless-bridge` still active; i18n queries from Phase 1a still resolve (no regression).

## Notes carried to later sub-plans

- **1d (seed):** use `Pricing::set_price($id, 'USD'|'EUR', 'regular'|'sale', $value)` to attach prices to seeded products and variations.
- Order currency capture (charging in the displayed currency) is a checkout concern (Phase 5), not 1b — 1b only models catalog prices.
- The base WooCommerce price stays the source of truth for order bookkeeping; `prices` is the headless storefront's display/charge source per the spec.
