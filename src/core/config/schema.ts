import { z } from "zod";

export const clientConfigSchema = z
  .object({
    identity: z.object({
      name: z.string().min(1),
      logo: z.string().default("/logo.svg"),
    }),
    locales: z.array(z.string().min(2)).min(1),
    defaultLocale: z.string().min(2),
    currencies: z.array(z.string().length(3)).min(1),
    defaultCurrency: z.string().length(3),
    countryCurrency: z
      .record(z.string().length(2), z.string().length(3))
      .default({}),
    wordpress: z.object({
      endpoint: z.url(),
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
  });

export type ClientConfig = z.infer<typeof clientConfigSchema>;
export type ClientConfigInput = z.input<typeof clientConfigSchema>;
