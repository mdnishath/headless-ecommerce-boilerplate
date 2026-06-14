import type { VariantProps } from "@core/studio/types";
import { CartIcon, Nav, SearchIcon, StoreName } from "./header-primitives";

export type MinimalLeftOptions = { sticky: boolean; showSearch: boolean };

export function MinimalLeft({ options }: VariantProps<MinimalLeftOptions>) {
  return (
    <header
      className={`border-b bg-background ${options.sticky ? "sticky top-0 z-40" : ""}`}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-4 py-4">
        <StoreName className="text-lg font-semibold" />
        <Nav className="flex gap-6 text-sm" />
        <div className="ml-auto flex items-center gap-4">
          {options.showSearch ? <SearchIcon /> : null}
          <CartIcon />
        </div>
      </div>
    </header>
  );
}
