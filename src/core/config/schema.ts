import { z } from "zod";

const localeCode = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'must be a locale code like "en" or "en-US"');
const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/, "must be an uppercase ISO-4217 currency code");
const countryCode = z
  .string()
  .regex(/^[A-Z]{2}$/, "must be an uppercase ISO-3166-1 alpha-2 country code");

export const clientConfigSchema = z
  .object({
    identity: z.object({
      name: z.string().min(1),
      logo: z.string().default("/logo.svg"),
    }),
    locales: z.array(localeCode).min(1),
    defaultLocale: localeCode,
    currencies: z.array(currencyCode).min(1),
    defaultCurrency: currencyCode,
    countryCurrency: z.record(countryCode, currencyCode).default({}),
    wordpress: z.object({
      endpoint: z.url({ protocol: /^https?$/ }),
    }),
    gateways: z.array(z.string()).default([]),
    features: z
      .object({
        reviews: z.boolean().default(false),
        wishlist: z.boolean().default(false),
      })
      .default({ reviews: false, wishlist: false }),
  })
  .refine((c) => c.locales.includes(c.defaultLocale), {
    message: "defaultLocale must be included in locales",
  })
  .refine((c) => c.currencies.includes(c.defaultCurrency), {
    message: "defaultCurrency must be included in currencies",
  })
  .refine(
    (c) =>
      Object.values(c.countryCurrency).every((cur) =>
        c.currencies.includes(cur),
      ),
    { message: "countryCurrency values must be included in currencies" },
  );

export type ClientConfig = z.infer<typeof clientConfigSchema>;
export type ClientConfigInput = z.input<typeof clientConfigSchema>;
