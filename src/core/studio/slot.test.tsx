// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Slot } from "@core/studio/slot";
import { getDefaultDoc } from "@core/studio/schema";

describe("Slot resolver", () => {
  it("renders the selected header variant", () => {
    render(<Slot name="header" doc={getDefaultDoc()} />);
    // classic-centered renders the store name link "Default Storefront"
    expect(screen.getByText("Default Storefront")).toBeDefined();
  });

  it("falls back to the default variant when the doc names an unknown variant", () => {
    const doc = getDefaultDoc();
    doc.slots.header.variant = "header.nope";
    render(<Slot name="header" doc={doc} />);
    expect(screen.getByText("Default Storefront")).toBeDefined();
  });
});
