import { describe, expect, it } from "vitest";
import { activeClient } from "./client";

describe("active client resolution", () => {
  it("resolves and validates the default client config", () => {
    expect(activeClient.identity.name).toBe("Default Storefront");
    expect(activeClient.locales).toContain("en");
    expect(activeClient.defaultCurrency).toBe("USD");
    // defaults applied by the schema:
    expect(activeClient.features.reviews).toBe(false);
  });
});
