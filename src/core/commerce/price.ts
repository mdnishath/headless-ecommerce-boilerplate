export type Price = { currency: string; regular: string; sale: string };

/** Choose the price entry for a currency, falling back to the first available. */
export function pickPrice(prices: Price[], currency = "USD"): Price | null {
  return prices.find((p) => p.currency === currency) ?? prices[0] ?? null;
}

/** Format a decimal-string amount as localized currency. */
export function formatPrice(amount: string, currency = "USD", locale = "en-US"): string {
  const n = Number.parseFloat(amount);
  if (Number.isNaN(n)) {
    return "";
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
}
