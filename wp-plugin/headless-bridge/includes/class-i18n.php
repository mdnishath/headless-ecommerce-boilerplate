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
}
