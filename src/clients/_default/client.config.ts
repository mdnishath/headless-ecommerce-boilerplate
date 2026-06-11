import type { ClientConfigInput } from "@core/config/schema";

export const clientConfig: ClientConfigInput = {
  identity: { name: "Default Storefront" },
  locales: ["en", "fr"],
  defaultLocale: "en",
  currencies: ["USD", "EUR"],
  defaultCurrency: "USD",
  countryCurrency: { US: "USD", FR: "EUR", DE: "EUR" },
  wordpress: { endpoint: "http://ecommerce-backend.local/graphql" },
  gateways: ["stripe"],
};
