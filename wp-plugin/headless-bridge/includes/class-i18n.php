<?php

namespace HeadlessBridge;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * i18n module: language taxonomy + translation-group linking + GraphQL exposure.
 */
class I18n
{
    /** Language taxonomy slug. */
    public const TAXONOMY = 'language';

    /** Post meta key holding the shared translation-group UUID. */
    public const GROUP_META = '_translation_group';

    /** Object types that get a language + translation linking. */
    public const OBJECT_TYPES = ['product', 'post', 'page'];

    /** Default language terms. code => display name. */
    public const LANGUAGES = ['en' => 'English', 'fr' => 'Français'];

    /** Register all hooks for this module. Called once from the bootstrap. */
    public function init(): void
    {
        add_action('init', [$this, 'register_taxonomy']);
        add_action('init', [$this, 'ensure_terms'], 11);
        add_action('graphql_register_types', [$this, 'register_graphql']);
        add_filter('graphql_connection_query_args', [$this, 'filter_language_query_args'], 10, 2);
        add_action('add_meta_boxes', [$this, 'add_metabox']);
        add_action('save_post', [$this, 'save_metabox'], 10, 1);
        add_action('admin_post_hb_create_translation', [$this, 'handle_create_translation']);
    }

    /** Register the non-hierarchical `language` taxonomy on supported types. */
    public function register_taxonomy(): void
    {
        register_taxonomy(
            self::TAXONOMY,
            self::OBJECT_TYPES,
            [
                'label'             => 'Language',
                'public'            => false,
                'show_ui'           => true,
                'show_in_menu'      => false,
                'show_admin_column' => true,
                'hierarchical'      => false,
                'show_in_graphql'   => false, // we expose a curated `language` field instead
                'rewrite'           => false,
            ]
        );
    }

    /** Create the language terms if missing. Term slug = language code. */
    public function ensure_terms(): void
    {
        foreach (self::LANGUAGES as $code => $name) {
            if (!term_exists($code, self::TAXONOMY)) {
                wp_insert_term($name, self::TAXONOMY, ['slug' => $code]);
            }
        }
    }

    /** Set a post's language by code (slug). No-op if the term is missing. */
    public function set_language(int $post_id, string $code): void
    {
        if (term_exists($code, self::TAXONOMY)) {
            wp_set_object_terms($post_id, $code, self::TAXONOMY, false);
        }
    }

    /** Read a post's language code, or '' if none assigned. */
    public function get_language(int $post_id): string
    {
        $terms = wp_get_object_terms($post_id, self::TAXONOMY, ['fields' => 'slugs']);
        return (is_array($terms) && $terms) ? (string) $terms[0] : '';
    }

    /** Read a post's translation-group UUID, creating+persisting one if absent. */
    public function get_or_create_group(int $post_id): string
    {
        $group = get_post_meta($post_id, self::GROUP_META, true);
        if (!is_string($group) || $group === '') {
            $group = wp_generate_uuid4();
            update_post_meta($post_id, self::GROUP_META, $group);
        }
        return $group;
    }

    /** Put $post_id into the same translation group as $sibling_id. */
    public function link_translation(int $post_id, int $sibling_id): void
    {
        $group = $this->get_or_create_group($sibling_id);
        update_post_meta($post_id, self::GROUP_META, $group);
    }

    /**
     * Sibling translations of $post_id (same group, excluding itself).
     * Returns a list of ['id','language','slug','uri'].
     */
    public function get_translations(int $post_id): array
    {
        $group = get_post_meta($post_id, self::GROUP_META, true);
        if (!is_string($group) || $group === '') {
            return [];
        }
        $siblings = get_posts([
            'post_type'      => get_post_type($post_id) ?: 'any',
            'post_status'    => 'any',
            'posts_per_page' => -1,
            'post__not_in'   => [$post_id],
            'meta_key'       => self::GROUP_META,
            'meta_value'     => $group,
            'fields'         => 'ids',
        ]);
        $out = [];
        foreach ($siblings as $sid) {
            $sid   = (int) $sid;
            $uri   = get_permalink($sid);
            $out[] = [
                'id'       => $sid,
                'language' => $this->get_language($sid),
                'slug'     => get_post_field('post_name', $sid),
                'uri'      => is_string($uri) ? wp_make_link_relative($uri) : '',
            ];
        }
        return $out;
    }

    /** Register curated i18n types + fields on Product/Post/Page. */
    public function register_graphql(): void
    {
        register_graphql_object_type('HBLanguage', [
            'description' => 'A content language.',
            'fields'      => [
                'code' => ['type' => 'String', 'description' => 'ISO code, e.g. "en".'],
                'name' => ['type' => 'String', 'description' => 'Display name.'],
            ],
        ]);

        register_graphql_object_type('HBTranslation', [
            'description' => 'A sibling translation reference.',
            'fields'      => [
                'language' => ['type' => 'String'],
                'slug'     => ['type' => 'String'],
                'uri'      => ['type' => 'String', 'description' => 'Relative permalink.'],
            ],
        ]);

        $names = self::LANGUAGES; // code => display name

        foreach (['Product', 'Post', 'Page'] as $gql_type) {
            register_graphql_field($gql_type, 'language', [
                'type'        => 'HBLanguage',
                'description' => 'The content language of this node.',
                'resolve'     => function ($source) use ($names) {
                    $code = $this->get_language((int) $source->ID);
                    if ($code === '') {
                        return null;
                    }
                    return ['code' => $code, 'name' => $names[$code] ?? $code];
                },
            ]);

            register_graphql_field($gql_type, 'translations', [
                'type'        => ['list_of' => 'HBTranslation'],
                'description' => 'Sibling translations in the same translation group.',
                'resolve'     => function ($source) {
                    return $this->get_translations((int) $source->ID);
                },
            ]);
        }

        // Add a `language` where-arg to the post + product root connections.
        // The exact WhereArgs input type names can be confirmed via introspection:
        //   { __type(name:"RootQueryToPostConnectionWhereArgs"){ inputFields{ name } } }
        foreach (['RootQueryToPostConnectionWhereArgs', 'RootQueryToProductConnectionWhereArgs'] as $where_type) {
            register_graphql_field($where_type, 'language', [
                'type'        => 'String',
                'description' => 'Filter to a single language code (taxonomy slug).',
            ]);
        }
    }

    /**
     * When a connection's where args include `language`, constrain the
     * underlying WP_Query with a tax_query on the language taxonomy.
     */
    public function filter_language_query_args(array $query_args, $resolver): array
    {
        $args = method_exists($resolver, 'getArgs') ? $resolver->getArgs() : [];
        $lang = $args['where']['language'] ?? '';
        if (!is_string($lang) || $lang === '') {
            return $query_args;
        }
        $tax_query   = $query_args['tax_query'] ?? [];
        $tax_query[] = [
            'taxonomy' => self::TAXONOMY,
            'field'    => 'slug',
            'terms'    => [$lang],
        ];
        $query_args['tax_query'] = $tax_query;
        return $query_args;
    }

    /** Add the Language metabox to supported post types. */
    public function add_metabox(): void
    {
        foreach (self::OBJECT_TYPES as $type) {
            add_meta_box('hb-language', 'Language & Translations', [$this, 'render_metabox'], $type, 'side', 'high');
        }
    }

    /** Render language selector + sibling list + "create translation" buttons. */
    public function render_metabox(\WP_Post $post): void
    {
        wp_nonce_field('hb_language_save', 'hb_language_nonce');
        $current = $this->get_language($post->ID);
        echo '<p><label for="hb-language-select"><strong>Language</strong></label><br/>';
        echo '<select name="hb_language" id="hb-language-select" style="width:100%">';
        echo '<option value="">— none —</option>';
        foreach (self::LANGUAGES as $code => $name) {
            printf(
                '<option value="%s"%s>%s</option>',
                esc_attr($code),
                selected($current, $code, false),
                esc_html($name)
            );
        }
        echo '</select></p>';

        $siblings = $this->get_translations($post->ID);
        echo '<p><strong>Translations</strong></p>';
        if ($siblings) {
            echo '<ul style="margin:0 0 8px 16px;list-style:disc">';
            foreach ($siblings as $s) {
                printf(
                    '<li><a href="%s">%s</a> (%s)</li>',
                    esc_url(get_edit_post_link((int) $s['id'])),
                    esc_html(get_the_title((int) $s['id'])),
                    esc_html($s['language'] ?: '—')
                );
            }
            echo '</ul>';
        } else {
            echo '<p style="color:#777">No linked translations yet.</p>';
        }

        $present = array_map(static fn ($s) => $s['language'], $siblings);
        if ($current !== '') {
            $present[] = $current;
        }
        foreach (self::LANGUAGES as $code => $name) {
            if (in_array($code, $present, true)) {
                continue;
            }
            $url = wp_nonce_url(
                admin_url('admin-post.php?action=hb_create_translation&source=' . $post->ID . '&lang=' . $code),
                'hb_create_translation_' . $post->ID
            );
            printf('<a href="%s" class="button" style="margin-top:4px">Create %s translation</a> ', esc_url($url), esc_html($name));
        }
    }

    /** Persist the chosen language and ensure the post has a group UUID. */
    public function save_metabox(int $post_id): void
    {
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
            return;
        }
        if (!isset($_POST['hb_language_nonce']) ||
            !wp_verify_nonce(sanitize_text_field($_POST['hb_language_nonce']), 'hb_language_save')) {
            return;
        }
        if (!current_user_can('edit_post', $post_id)) {
            return;
        }
        if (in_array(get_post_type($post_id), self::OBJECT_TYPES, true)) {
            $code = isset($_POST['hb_language']) ? sanitize_text_field($_POST['hb_language']) : '';
            if ($code !== '') {
                $this->set_language($post_id, $code);
                $this->get_or_create_group($post_id);
            }
        }
    }

    /** Clone the source post into a new draft in the target language, same group. */
    public function handle_create_translation(): void
    {
        $source = isset($_GET['source']) ? (int) $_GET['source'] : 0;
        $lang   = isset($_GET['lang']) ? sanitize_text_field($_GET['lang']) : '';

        if (!$source || !isset(self::LANGUAGES[$lang])) {
            wp_die('Invalid translation request.');
        }
        check_admin_referer('hb_create_translation_' . $source);
        if (!current_user_can('edit_post', $source)) {
            wp_die('Insufficient permissions.');
        }

        $src = get_post($source);
        if (!$src) {
            wp_die('Source not found.');
        }

        $new_id = wp_insert_post([
            'post_type'    => $src->post_type,
            'post_status'  => 'draft',
            'post_title'   => $src->post_title . ' (' . $lang . ')',
            'post_content' => $src->post_content,
            'post_excerpt' => $src->post_excerpt,
        ]);
        if (is_wp_error($new_id)) {
            wp_die('Could not create translation.');
        }

        $this->set_language((int) $new_id, $lang);
        $this->link_translation((int) $new_id, $source);

        wp_safe_redirect(get_edit_post_link((int) $new_id, 'redirect'));
        exit;
    }
}
