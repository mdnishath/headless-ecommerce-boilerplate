import Link from "next/link";
import { Search, ShoppingBag } from "lucide-react";
import { activeClient } from "@/client";

export function StoreName({ className }: { className?: string }) {
  return (
    <Link href="/" className={className}>
      {activeClient.identity.name}
    </Link>
  );
}

const NAV = [
  { label: "Shop", href: "/" },
  { label: "T-Shirts", href: "/?category=t-shirts" },
  { label: "Hoodies", href: "/?category=hoodies" },
];

export function Nav({ className }: { className?: string }) {
  return (
    <nav className={className}>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className="hover:text-primary">
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

export function SearchIcon() {
  return <Search className="h-5 w-5" aria-label="Search" />;
}

export function CartIcon() {
  return <ShoppingBag className="h-5 w-5" aria-label="Cart" />;
}
