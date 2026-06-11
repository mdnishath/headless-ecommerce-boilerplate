import { describe, expect, it } from "vitest";
import { clientConfigSchema } from "./schema";

const valid = {
  identity: { name: "Test Store" },
  locales: ["en", "fr"],
  defaultLocale: "en",
  currencies: ["USD", "EUR"],
  defaultCurrency: "USD",
  wordpress: { endpoint: "http://localhost:8080/graphql" },
};

describe("clientConfigSchema", () => {
  it("accepts a minimal valid config and applies defaults", () => {
    const parsed = clientConfigSchema.parse(valid);
    expect(parsed.gateways).toEqual([]);
    expect(parsed.features.reviews).toBe(false);
    expect(parsed.features.wishlist).toBe(false);
    expect(parsed.countryCurrency).toEqual({});
    expect(parsed.identity.logo).toBe("/logo.svg");
  });

  it("rejects a defaultLocale that is not in locales", () => {
    expect(() =>
      clientConfigSchema.parse({ ...valid, defaultLocale: "de" }),
    ).toThrow(/defaultLocale/);
  });

  it("rejects a defaultCurrency that is not in currencies", () => {
    expect(() =>
      clientConfigSchema.parse({ ...valid, defaultCurrency: "BDT" }),
    ).toThrow(/defaultCurrency/);
  });

  it("rejects a non-URL wordpress endpoint", () => {
    expect(() =>
      clientConfigSchema.parse({
        ...valid,
        wordpress: { endpoint: "not-a-url" },
      }),
    ).toThrow();
  });

  it("rejects non-http(s) wordpress endpoints", () => {
    expect(() =>
      clientConfigSchema.parse({
        ...valid,
        wordpress: { endpoint: "ftp://example.com/graphql" },
      }),
    ).toThrow();
  });

  it("rejects lowercase currency codes", () => {
    expect(() =>
      clientConfigSchema.parse({
        ...valid,
        currencies: ["usd"],
        defaultCurrency: "usd",
      }),
    ).toThrow(/ISO-4217/);
  });

  it("rejects countryCurrency keys that are not uppercase 2-letter codes", () => {
    expect(() =>
      clientConfigSchema.parse({ ...valid, countryCurrency: { usa: "USD" } }),
    ).toThrow();
  });

  it("rejects countryCurrency values missing from currencies", () => {
    expect(() =>
      clientConfigSchema.parse({ ...valid, countryCurrency: { DE: "JPY" } }),
    ).toThrow(/countryCurrency/);
  });

  it("rejects malformed locale codes", () => {
    expect(() =>
      clientConfigSchema.parse({
        ...valid,
        locales: ["EN!", "fr"],
        defaultLocale: "fr",
      }),
    ).toThrow();
  });
});
