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
    update_post_meta($id, '_price', $regular[0]);
    update_post_meta($id, '_regular_price', $regular[0]);
    $pricing->set_price($id, 'USD', 'regular', (string) $regular[0]);
    $pricing->set_price($id, 'EUR', 'regular', (string) $regular[1]);
    $pricing->set_price($id, 'USD', 'sale', isset($sale[0]) ? (string) $sale[0] : '');
    $pricing->set_price($id, 'EUR', 'sale', isset($sale[1]) ? (string) $sale[1] : '');
    $i18n->set_language($id, $lang);
    $set_image($id, $key . '-' . $lang);
    return $id;
};

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

/**
 * Upsert a variable product (EN) with size variations + a simple FR clone.
 */
$upsert_variable = static function (
    string $key, string $title_en, string $title_fr, string $desc_en, string $desc_fr,
    int $cat_id, array $regular, array $sizes, array $colors
) use ($find_seeded, $pricing, $i18n, $set_image, $upsert_simple): array {
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
    $pricing->set_price($id, 'USD', 'regular', (string) $regular[0]);
    $pricing->set_price($id, 'EUR', 'regular', (string) $regular[1]);
    $i18n->set_language($id, 'en');
    $set_image($id, $key . '-en');

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
        $variation->set_regular_price((string) $regular[0]);
        $vid = (int) $variation->save();
        $pricing->set_price($vid, 'USD', 'regular', (string) $regular[0]);
        $pricing->set_price($vid, 'EUR', 'regular', (string) $regular[1]);
    }
    \WC_Product_Variable::sync($id);
    wc_delete_product_transients($id);

    $fr = $upsert_simple($key, 'fr', $title_fr, $desc_fr, $cat_id, $regular, []);
    $i18n->link_translation($fr, $id);

    return [$id, $fr];
};

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

echo 'CATEGORIES:' . count(array_filter($cat_ids)) . "\n";
