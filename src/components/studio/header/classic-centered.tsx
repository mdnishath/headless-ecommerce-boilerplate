import type { VariantProps } from "@core/studio/types";
import { CartIcon, Nav, SearchIcon, StoreName } from "./header-primitives";

export type ClassicCenteredOptions = { sticky: boolean; showSearch: boolean };

export function ClassicCentered({ options }: VariantProps<ClassicCenteredOptions>) {
  return (
    <header
      className={`border-b bg-background ${options.sticky ? "sticky top-0 z-40" : ""}`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="w-16">{options.showSearch ? <SearchIcon /> : null}</div>
        <StoreName className="text-xl font-bold tracking-tight" />
        <div className="flex w-16 justify-end">
          <CartIcon />
        </div>
      </div>
      <Nav className="mx-auto flex max-w-6xl justify-center gap-6 pb-3 text-sm" />
    </header>
  );
}
