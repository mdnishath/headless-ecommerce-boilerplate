<?php
/**
 * Plugin Name: Headless Bridge
 * Description: Companion plugin for the headless storefront — i18n translation groups, multi-currency pricing, cache revalidation webhooks, GraphQL hardening.
 * Version: 0.1.0
 * Requires at least: 6.5
 * Requires PHP: 8.1
 */

if (!defined('ABSPATH')) {
    exit;
}

define('HEADLESS_BRIDGE_DIR', plugin_dir_path(__FILE__));
define('HEADLESS_BRIDGE_FILE', __FILE__);

require_once HEADLESS_BRIDGE_DIR . 'includes/class-i18n.php';

/**
 * Instantiate and initialise every module once WordPress + plugins are loaded.
 * Modules (Pricing, Revalidation, Hardening) are added to this list in later phases.
 */
add_action('plugins_loaded', static function (): void {
    (new \HeadlessBridge\I18n())->init();
});
