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

    /** Register all hooks for this module. Called once from the bootstrap. */
    public function init(): void
    {
        // Hooks are added by later tasks.
    }
}
