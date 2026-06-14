# Phase 1d: Seed Bilingual / Bi-Currency Apparel Catalog

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A single idempotent seed that creates a real apparel catalog in WooCommerce — categories, simple + variable products with size/color attributes, per-currency (USD/EUR) prices via the Pricing module, and EN→FR linked translations via the i18n module — so the storefront (Phase 2) renders real data.

**Architecture:** One PHP seed file `wp-env/seed-catalog.php` (run via WP-CLI `eval-file`) plus a thin `wp-env/seed.ps1` runner. The seed is idempotent: products are keyed by a stable `_hb_seed_key` meta; re-running updates rather than duplicates. It calls `HeadlessBridge\Pricing::set_price()` for prices and `HeadlessBridge\I18n::set_language()` / `link_translation()` for translations. Verification is GraphQL queries asserting counts, prices, languages, and variations.

**Tech Stack:** PHP 8.1, WooCommerce CRUD (`WC_Product_Simple`, `WC_Product_Variable`, `WC_Product_Variation`, `WC_Product_Attribute`), WP term API, the headless-bridge `Pricing` + `I18n` modules.

**Preconditions:** LocalWP site `ecommerce-backend` running. WP-CLI via `powershell -ExecutionPolicy Bypass -File wp-env\wp.ps1 <args>`. GraphQL at http://ecommerce-backend.local/graphql (HTTP). Phases 1a (i18n) + 1b (pricing) complete and active. Plugin junction-linked.

## The catalog (exact data to seed)

Currency prices are `[USD, EUR]` regular (sale optional). Categories (slug → EN name / FR name):
- `t-shirts` → "T-Shirts" / "T-Shirts"
- `hoodies` → "Hoodies" / "Sweats à capuche"
- `jeans` → "Jeans" / "Jeans"
- `accessories` → "Accessories" / "Accessoires"

Products (seed_key → type, category, EN title, FR title, USD/EUR regular, [sale], attributes):
1. `classic-tee` — variable, t-shirts — "Classic Cotton T-Shirt" / "T-Shirt en coton classique" — 19.99/18.99 — attrs: Size [S,M,L], Color [Black,White]
2. `premium-hoodie` — variable, hoodies — "Premium Hoodie" / "Sweat à capuche premium" — 49.99/46.99 — attrs: Size [S,M,L]
3. `slim-jeans` — variable, jeans — "Slim Fit Jeans" / "Jean coupe slim" — 59.99/55.99 — attrs: Size [30,32,34]
4. `tote-bag` — simple, accessories — "Canvas Tote Bag" / "Sac fourre-tout en toile" — 24.99/22.99
5. `knit-beanie` — simple, accessories — "Knit Beanie" / "Bonnet en maille" — 14.99/13.99
6. `graphic-tee` — simple, t-shirts — "Graphic Print Tee" / "T-Shirt imprimé" — 22.99/21.99 — sale 17.99/16.99
7. `zip-hoodie` — simple, hoodies — "Zip-Up Hoodie" / "Sweat à capuche zippé" — 54.99/51.99
8. `leather-belt` — simple, accessories — "Leather Belt" / "Ceinture en cuir" — 34.99/32.99

For each product: an EN post and a linked FR post (same `_hb_seed_key` + `_lang` suffix), both assigned their category, both priced in USD+EUR, both language-tagged, and linked as translations. Variable products: the EN variant carries the variations; the FR variant is a simple clone at the same price for catalog display (variation-level FR is out of scope — note it). A best-effort placeholder image is sideloaded per product (continue on failure).

---

### Task 1: Seed runner + idempotent infrastructure + categories

**Files:**
- Create: `wp-env/seed.ps1`
- Create: `wp-env/seed-catalog.php`

- [ ] **Step 1: Create `wp-env/seed.ps1`** — a runner that calls the PHP seed via the wp.ps1 discovery. Simplest: delegate to wp.ps1 eval-file.

```powershell
# Seeds the apparel catalog into the running LocalWP 'ecommerce-backend' site.
# Idempotent: re-running updates existing seed products rather than duplicating.
$ErrorActionPreference = "Stop"
$seedFile = Join-Path $PSScriptRoot "seed-catalog.php"
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "wp.ps1") eval-file $seedFile
exit $LASTEXITCODE
```

- [ ] **Step 2: Create `wp-env/seed-catalog.php`** with the bootstrap, idempotency helpers, and category creation. (Products are appended in later tasks.)

```php
<?php
/**
 * Idempotent apparel catalog seed for the headless-bridge storefront.
 * Run via: powershell -File wp-env\seed.ps1   (or wp eval-file wp-env\seed-catalog.php)
 */

if (!defined('ABSPATH')) {
    exit;
}

$pricing = new \HeadlessBridge\Pricing();
$i18n    = new \HeadlessBridge\I18n();

/** Find a seeded post by its stable key + language, or 0. */
$find_seeded = static function (string $key, string $lang): int {
    $q = get_posts([
        'post_type'   => 'product',
        'post_status' => 'any',
        'numberposts' => 1,
        'fields'      => 'ids',
        'meta_query'  => [
            ['key' => '_hb_seed_key', 'value' => $key],
            ['key' => '_hb_seed_lang', 'value' => $lang],
        ],
    ]);
    return $q ? (int) $q[0] : 0;
};

/** Ensure a product category exists (by slug); return term_id. */
$ensure_cat = static function (string $slug, string $name): int {
    $term = get_term_by('slug', $slug, 'product_cat');
    if ($term) {
        return (int) $term->term_id;
    }
    $res = wp_insert_term($name, 'product_cat', ['slug' => $slug]);
    return is_wp_error($res) ? 0 : (int) $res['term_id'];
};

$categories = [
    't-shirts'    => ['T-Shirts', 'T-Shirts'],
    'hoodies'     => ['Hoodies', 'Sweats à capuche'],
    'jeans'       => ['Jeans', 'Jeans'],
    'accessories' => ['Accessories', 'Accessoires'],
];
$cat_ids = [];
foreach ($categories as $slug => $names) {
    $cat_ids[$slug] = $ensure_cat($slug, $names[0]);
    // Tag the EN display name as the category's language (term meta) for later category-language work.
    update_term_meta($cat_ids[$slug], '_hb_lang', 'en');
    update_term_meta($cat_ids[$slug], '_hb_name_fr', $names[1]);
}

echo 'CATEGORIES:' . count(array_filter($cat_ids)) . "\n";
```

- [ ] **Step 3: Run + verify categories**

```powershell
powershell -ExecutionPolicy Bypass -File wp-env\seed.ps1
```
Expected output ends with `CATEGORIES:4`.

```powershell
powershell -ExecutionPolicy Bypass -File wp-env\wp.ps1 term list product_cat --fields=slug,name
```
Expected: includes `t-shirts`, `hoodies`, `jeans`, `accessories` (plus the default `uncategorized`).

- [ ] **Step 4: Commit**

```powershell
git add wp-env/seed.ps1 wp-env/seed-catalog.php
git commit -m "feat(seed): catalog seed runner + idempotent categories"
```

---

### Task 2: Seed helper to upsert one product (simple) with prices, category, language, image

**Files:**
- Modify: `wp-env/seed-catalog.php`

- [ ] **Step 1: Insert an `upsert_simple` closure + a placeholder-image helper BEFORE the final `echo`, and call it for the 5 simple products.**

Add after the category block (before the final summary echo):

```php
/** Best-effort: sideload a placeholder image and set it as the product thumbnail. */
$set_image = static function (int $product_id, string $seed): void {
    if (get_post_thumbnail_id($product_id)) {
        return; // already has one — idempotent
    }
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';
    $url = 'https://picsum.photos/seed/' . rawurlencode($seed) . '/600/750';
    $id  = media_sideload_image($url, $product_id, null, 'id');
    if (!is_wp_error($id)) {
        set_post_thumbnail($product_id, (int) $id);
    }
};

/**
 * Upsert a simple product in one language. Returns the product ID.
 * $sale is [usd, eur] or [] for none.
 */
$upsert_simple = static function (
    string $key, string $lang, string $title, string $desc, int $cat_id,
    array $regular, array $sale
) use ($find_seeded, $pricing, $i18n, $set_image): int {
    $id = $find_seeded($key, $lang);
    $data = [
        'post_type'    => 'product',
        'post_status'  => 'publish',
        'post_title'   => $title,
        'post_content' => $desc,
    ];
    if ($id) {
        $data['ID'] = $id;
        wp_update_post($data);
    } else {
        $id = (int) wp_insert_post($data);
        update_post_meta($id, '_hb_seed_key', $key);
        update_post_meta($id, '_hb_seed_lang', $lang);
    }
    wp_set_object_terms($id, [$cat_id], 'product_cat');
    // Base WooCommerce price (bookkeeping source of truth) = USD regular.
    update_post_meta($id, '_price', $regular[0]);
    update_post_meta($id, '_regular_price', $regular[0]);
    // Per-currency prices (headless display/charge source).
    $pricing->set_price($id, 'USD', 'regular', (string) $regular[0]);
    $pricing->set_price($id, 'EUR', 'regular', (string) $regular[1]);
    $pricing->set_price($id, 'USD', 'sale', isset($sale[0]) ? (string) $sale[0] : '');
    $pricing->set_price($id, 'EUR', 'sale', isset($sale[1]) ? (string) $sale[1] : '');
    $i18n->set_language($id, $lang);
    $set_image($id, $key . '-' . $lang);
    return $id;
};

// seed_key => [cat_slug, EN title, FR title, EN desc, FR desc, [usdReg,eurReg], [usdSale,eurSale]]
$simple = [
    'tote-bag'     => ['accessories', 'Canvas Tote Bag', 'Sac fourre-tout en toile', 'Durable canvas tote.', 'Sac en toile durable.', [24.99, 22.99], []],
    'knit-beanie'  => ['accessories', 'Knit Beanie', 'Bonnet en maille', 'Warm knit beanie.', 'Bonnet chaud en maille.', [14.99, 13.99], []],
    'graphic-tee'  => ['t-shirts', 'Graphic Print Tee', 'T-Shirt imprimé', 'Soft cotton graphic tee.', 'T-shirt en coton imprimé.', [22.99, 21.99], [17.99, 16.99]],
    'zip-hoodie'   => ['hoodies', 'Zip-Up Hoodie', 'Sweat à capuche zippé', 'Cozy zip-up hoodie.', 'Sweat zippé confortable.', [54.99, 51.99], []],
    'leather-belt' => ['accessories', 'Leather Belt', 'Ceinture en cuir', 'Genuine leather belt.', 'Ceinture en cuir véritable.', [34.99, 32.99], []],
];
$simple_count = 0;
foreach ($simple as $key => $d) {
    $cat = $cat_ids[$d[0]] ?? 0;
    $en  = $upsert_simple($key, 'en', $d[1], $d[3], $cat, $d[5], $d[6]);
    $fr  = $upsert_simple($key, 'fr', $d[2], $d[4], $cat, $d[5], $d[6]);
    $i18n->link_translation($fr, $en);
    $simple_count++;
}
echo 'SIMPLE:' . $simple_count . "\n";
```

- [ ] **Step 2: Run + verify**

```powershell
powershell -ExecutionPolicy Bypass -File wp-env\seed.ps1
```
Expected output includes `SIMPLE:5` (and `CATEGORIES:4`). Image sideload may print warnings if offline — that's tolerated.

Verify via GraphQL (EN + FR simple products with prices + language):
```powershell
$body = '{"query":"{ en:products(where:{language:\"en\"} first:20){ nodes { name prices { currency regular } language { code } } } fr:products(where:{language:\"fr\"} first:20){ nodes { name } } }"}'
Invoke-RestMethod -Uri "http://ecommerce-backend.local/graphql" -Method Post -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 8
```
Expected: `en.nodes` contains the 5 EN simple titles, each with `prices` (USD+EUR) and `language.code = "en"`; `fr.nodes` contains the 5 FR titles.

- [ ] **Step 3: Commit**

```powershell
git add wp-env/seed-catalog.php
git commit -m "feat(seed): 5 simple bilingual products with per-currency prices + images"
```

---

### Task 3: Seed variable products with size/color attributes + per-currency variation prices

**Files:**
- Modify: `wp-env/seed-catalog.php`

- [ ] **Step 1: Add a variable-product upsert and seed the 3 variable products.**

Insert before the final summary echo. This builds a `WC_Product_Variable`, sets global-free (custom) attributes, creates one variation per size (color, when present, is a non-varying attribute for simplicity), and prices each variation per-currency. The FR counterpart is a simple priced clone (variation-level FR deferred).

```php
/**
 * Upsert a variable product (EN) with size variations + a simple FR clone.
 * $sizes = ['S','M','L']; $colors = ['Black','White'] or [].
 */
$upsert_variable = static function (
    string $key, string $title_en, string $title_fr, string $desc_en, string $desc_fr,
    int $cat_id, array $regular, array $sizes, array $colors
) use ($find_seeded, $pricing, $i18n, $set_image, $upsert_simple): array {
    // --- EN variable parent ---
    $id = $find_seeded($key, 'en');
    $product = $id ? new \WC_Product_Variable($id) : new \WC_Product_Variable();
    $product->set_name($title_en);
    $product->set_description($desc_en);
    $product->set_status('publish');
    $product->set_category_ids([$cat_id]);

    $attributes = [];
    $size_attr = new \WC_Product_Attribute();
    $size_attr->set_name('Size');
    $size_attr->set_options($sizes);
    $size_attr->set_visible(true);
    $size_attr->set_variation(true);
    $attributes[] = $size_attr;
    if ($colors) {
        $color_attr = new \WC_Product_Attribute();
        $color_attr->set_name('Color');
        $color_attr->set_options($colors);
        $color_attr->set_visible(true);
        $color_attr->set_variation(false);
        $attributes[] = $color_attr;
    }
    $product->set_attributes($attributes);
    $id = (int) $product->save();

    if (!get_post_meta($id, '_hb_seed_key', true)) {
        update_post_meta($id, '_hb_seed_key', $key);
        update_post_meta($id, '_hb_seed_lang', 'en');
    }
    // Parent per-currency price (display "from" price) = base regular.
    $pricing->set_price($id, 'USD', 'regular', (string) $regular[0]);
    $pricing->set_price($id, 'EUR', 'regular', (string) $regular[1]);
    $i18n->set_language($id, 'en');
    $set_image($id, $key . '-en');

    // --- Variations: one per size (idempotent by attribute value) ---
    $existing = [];
    foreach ($product->get_children() as $child_id) {
        $v = new \WC_Product_Variation($child_id);
        $existing[$v->get_attribute('Size')] = $child_id;
    }
    foreach ($sizes as $size) {
        $vid = $existing[$size] ?? 0;
        $variation = $vid ? new \WC_Product_Variation($vid) : new \WC_Product_Variation();
        $variation->set_parent_id($id);
        $variation->set_attributes(['Size' => $size]);
        $variation->set_regular_price((string) $regular[0]); // base USD for bookkeeping
        $vid = (int) $variation->save();
        $pricing->set_price($vid, 'USD', 'regular', (string) $regular[0]);
        $pricing->set_price($vid, 'EUR', 'regular', (string) $regular[1]);
    }

    // --- FR counterpart: simple priced clone for catalog display ---
    $fr = $upsert_simple($key, 'fr', $title_fr, $desc_fr, $cat_id, $regular, []);
    $i18n->link_translation($fr, $id);

    return [$id, $fr];
};

// seed_key => [cat_slug, EN title, FR title, EN desc, FR desc, [usdReg,eurReg], sizes, colors]
$variable = [
    'classic-tee'    => ['t-shirts', 'Classic Cotton T-Shirt', 'T-Shirt en coton classique', 'Everyday cotton tee.', 'T-shirt en coton pour tous les jours.', [19.99, 18.99], ['S', 'M', 'L'], ['Black', 'White']],
    'premium-hoodie' => ['hoodies', 'Premium Hoodie', 'Sweat à capuche premium', 'Heavyweight premium hoodie.', 'Sweat à capuche premium épais.', [49.99, 46.99], ['S', 'M', 'L'], []],
    'slim-jeans'     => ['jeans', 'Slim Fit Jeans', 'Jean coupe slim', 'Stretch slim-fit denim.', 'Jean slim extensible.', [59.99, 55.99], ['30', '32', '34'], []],
];
$variable_count = 0;
foreach ($variable as $key => $d) {
    $cat = $cat_ids[$d[0]] ?? 0;
    $upsert_variable($key, $d[1], $d[2], $d[3], $d[4], $cat, $d[5], $d[6], $d[7]);
    $variable_count++;
}
echo 'VARIABLE:' . $variable_count . "\n";
```

- [ ] **Step 2: Run + verify**

```powershell
powershell -ExecutionPolicy Bypass -File wp-env\seed.ps1
```
Expected: output includes `VARIABLE:3`, `SIMPLE:5`, `CATEGORIES:4`.

Verify a variable product's variations + per-currency prices via GraphQL:
```powershell
$body = '{"query":"{ products(where:{search:\"Classic Cotton\"}){ nodes { name ... on VariableProduct { prices { currency regular } variations { nodes { name prices { currency regular } } } } } } }"}'
Invoke-RestMethod -Uri "http://ecommerce-backend.local/graphql" -Method Post -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 10
```
Expected: the Classic Cotton T-Shirt resolves as a VariableProduct with `prices` (USD+EUR) and `variations.nodes` (3 sizes), each variation having `prices` USD+EUR. No `errors`.

- [ ] **Step 3: Commit**

```powershell
git add wp-env/seed-catalog.php
git commit -m "feat(seed): 3 variable products with size variations + per-currency variation prices"
```

---

### Task 4: Idempotency + full-catalog verification

**Files:** none (verification only)

- [ ] **Step 1: Re-run the seed and confirm NO duplicates**

```powershell
powershell -ExecutionPolicy Bypass -File wp-env\seed.ps1
powershell -ExecutionPolicy Bypass -File wp-env\wp.ps1 post list --post_type=product --post_status=publish --format=count
```
Expected: the count is stable across runs — 8 EN + 8 FR = 16 product posts (variations are `product_variation`, not counted here). Run the seed a SECOND time and confirm the count is still 16 (idempotent, no duplication).

- [ ] **Step 2: Full catalog GraphQL smoke**

```powershell
$body = '{"query":"{ all:products(first:50){ pageInfo { hasNextPage } nodes { __typename name language { code } prices { currency regular } } } cats:productCategories(first:20){ nodes { name slug count } } }"}'
Invoke-RestMethod -Uri "http://ecommerce-backend.local/graphql" -Method Post -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 8
```
Expected: ~16 product nodes (mix of `SimpleProduct` + `VariableProduct`), each with a `language.code` (en or fr) and `prices` (USD+EUR); `cats` shows the 4 categories with non-zero `count`. No `errors`.

- [ ] **Step 3: Confirm prior phases still green (no regression)**

```powershell
powershell -ExecutionPolicy Bypass -File wp-env\wp.ps1 plugin list --status=active --field=name
```
Expected: 5 active incl. headless-bridge.

```powershell
cd "E:\Ecommerce Platform"; npm run typecheck; npm run lint; npm test
```
Expected: all exit 0 (frontend untouched by 1d, sanity only).

- [ ] **Step 4: Commit (verification notes only, if any tweaks were needed)**

If Steps 1-3 required any fix to the seed, commit it:
```powershell
git add wp-env/seed-catalog.php
git commit -m "fix(seed): idempotency/verification adjustments"
```
Otherwise no commit needed.

---

## Phase 1d Definition of Done

- `wp-env\seed.ps1` runs idempotently (re-run → 16 product posts, no duplicates).
- 4 categories; 8 products (3 variable + 5 simple) in EN, each with a linked FR translation.
- Every product has USD + EUR prices; variations have per-currency prices; sale prices on `graphic-tee`.
- GraphQL returns the full bilingual, bi-currency catalog with categories and variations; no errors.
- Prior phases unaffected (plugin active; frontend gates green).

## Notes carried forward

- **Phase 2** consumes this catalog: product listing (PLP) + product detail (PDP) pages query `products`, `prices`, `language`, `variations`, `productCategories`. The frontend currency/locale resolution decides which `prices` entry + which `language` to show.
- Variation-level FR translations are deferred (FR product is a simple clone); revisit if a client needs per-variation localized variations.
- Category language is stored as term meta (`_hb_lang`, `_hb_name_fr`); a full category translation-group + GraphQL where-arg on the category connection is deferred (see 1a carry-forward note).
- Placeholder images come from picsum.photos (best-effort); a client replaces them with real assets.
