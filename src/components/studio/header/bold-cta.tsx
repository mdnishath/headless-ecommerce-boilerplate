import type { VariantProps } from "@core/studio/types";
import { CartIcon, Nav, StoreName } from "./header-primitives";

export type BoldCtaOptions = { sticky: boolean; ctaText: string };

export function BoldCta({ options }: VariantProps<BoldCtaOptions>) {
  return (
    <header
      className={`border-b bg-primary text-primary-foreground ${options.sticky ? "sticky top-0 z-40" : ""}`}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-4 py-4">
        <StoreName className="text-lg font-bold" />
        <Nav className="hidden gap-6 text-sm md:flex" />
        <div className="ml-auto flex items-center gap-4">
          <span className="rounded-md bg-background px-3 py-1 text-sm font-medium text-foreground">
            {options.ctaText}
          </span>
          <CartIcon />
        </div>
      </div>
    </header>
  );
}
