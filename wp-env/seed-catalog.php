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
