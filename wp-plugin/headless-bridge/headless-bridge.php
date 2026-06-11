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

// Modules (i18n, pricing, revalidation, hardening) are registered here from Phase 1 onward.
