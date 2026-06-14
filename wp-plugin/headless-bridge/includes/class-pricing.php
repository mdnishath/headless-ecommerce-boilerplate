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

    /** Sanitise a price string to a decimal or '' (empty clears the price). */
    public function sanitize_price(string $value): string
    {
        $value = trim($value);
        if ($value === '') {
            return '';
        }
        // Accept comma or dot decimal separators; keep digits + one dot.
        $value = str_replace(',', '.', $value);
        return is_numeric($value) ? number_format((float) $value, 2, '.', '') : '';
    }

    /** Store (or clear, when '') a currency price on a post/variation. */
    public function set_price(int $post_id, string $currency, string $kind, string $value): void
    {
        $key   = $this->meta_key($currency, $kind);
        $clean = $this->sanitize_price($value);
        if ($clean === '') {
            delete_post_meta($post_id, $key);
        } else {
            update_post_meta($post_id, $key, $clean);
        }
    }

    /** Read a currency price, or '' if unset. */
    public function get_price(int $post_id, string $currency, string $kind): string
    {
        $val = get_post_meta($post_id, $this->meta_key($currency, $kind), true);
        return is_string($val) ? $val : '';
    }

    /**
     * All configured-currency prices for a post.
     * Returns a list of ['currency','regular','sale'] for currencies that have
     * a regular price set.
     */
    public function get_prices(int $post_id): array
    {
        $out = [];
        foreach ($this->get_currencies() as $cur) {
            $regular = $this->get_price($post_id, $cur, 'regular');
            if ($regular === '') {
                continue;
            }
            $out[] = [
                'currency' => $cur,
                'regular'  => $regular,
                'sale'     => $this->get_price($post_id, $cur, 'sale'),
            ];
        }
        return $out;
    }

    /** Configured currencies that have NO regular price on this post. */
    public function missing_currencies(int $post_id): array
    {
        $present = array_column($this->get_prices($post_id), 'currency');
        return array_values(array_diff($this->get_currencies(), $present));
    }
}
