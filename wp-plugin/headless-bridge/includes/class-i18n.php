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
    }
}
