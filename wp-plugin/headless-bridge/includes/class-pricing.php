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
