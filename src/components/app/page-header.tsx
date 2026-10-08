"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  /** Small line above the large title (e.g. today's date). */
  eyebrow?: string;
  /** Trailing control in the top bar (e.g. a "+" button). */
  action?: ReactNode;
  /** Shows an iOS-style back link in the top bar. */
  back?: { href: string; label: string };
  /** Detail pages use the compact inline title only. */
  compact?: boolean;
};

/**
 * iOS navigation bar: a large title that scrolls away, and a translucent
 * sticky bar that shows the small title once the large one is gone.
 */
export function PageHeader({ title, eyebrow, action, back, compact = false }: PageHeaderProps) {
  const largeTitleRef = useRef<HTMLHeadingElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(compact);

  useEffect(() => {
    const element = largeTitleRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setIsCollapsed(!entry.isIntersecting), {
      rootMargin: "-56px 0px 0px 0px",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        className={cn(
          "pt-safe sticky top-0 z-30 -mx-4 transition-[background-color,border-color] duration-200",
          isCollapsed
            ? "border-b border-separator/70 bg-background/80 backdrop-blur-xl backdrop-saturate-150"
            : "border-b border-transparent",
        )}
      >
        <div className="relative flex h-11 items-center justify-between px-2">
          <div className="flex min-w-0 flex-1 items-center">
            {back && (
              <Link
                href={back.href}
                className="-ml-1 flex h-11 items-center gap-0.5 pr-2 text-[17px] text-primary active:opacity-60"
              >
                <ChevronLeft className="size-7" strokeWidth={2.25} />
                <span className="truncate">{back.label}</span>
              </Link>
            )}
          </div>
          <p
            aria-hidden={!isCollapsed}
            className={cn(
              "pointer-events-none absolute inset-x-24 truncate text-center text-[17px] font-semibold transition-opacity duration-200",
              isCollapsed ? "opacity-100" : "opacity-0",
            )}
          >
            {title}
          </p>
          <div className="flex flex-1 items-center justify-end pr-2">{action}</div>
        </div>
      </div>
      {!compact && (
        <div className="pt-1 pb-3">
          {eyebrow && (
            <p className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">{eyebrow}</p>
          )}
          <h1 ref={largeTitleRef} className="text-[34px] leading-tight font-bold tracking-tight">
            {title}
          </h1>
        </div>
      )}
    </>
  );
}
