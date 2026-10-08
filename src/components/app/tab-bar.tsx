"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, ListChecks, Nfc, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Painel", icon: House },
  { href: "/tarefas", label: "Tarefas", icon: ListChecks },
  { href: "/tags", label: "Tags", icon: Nfc },
  { href: "/definicoes", label: "Definições", icon: Settings },
] as const;

function isTabActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Bottom tab bar, translucent like UITabBar, above the home indicator. */
export function TabBar() {
  const pathname = usePathname();
  return <TabBarView pathname={pathname} />;
}

/** Static version for the Suspense fallback (no active tab). */
export function TabBarView({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Navegação principal"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-separator/70 bg-background/80 backdrop-blur-xl backdrop-saturate-150"
    >
      <ul className="mx-auto flex max-w-xl">
        {TABS.map(({ href, label, icon: Icon }) => {
          const isActive = isTabActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-[52px] flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground active:text-foreground",
                )}
              >
                <Icon className="size-[25px]" strokeWidth={isActive ? 2.3 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
