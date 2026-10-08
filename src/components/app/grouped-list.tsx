import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ListSectionProps = {
  title?: ReactNode;
  /** Small text under the group (iOS section footer). */
  footer?: ReactNode;
  /** Trailing control next to the title (e.g. "Ver tudo"). */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** iOS inset-grouped section: caption, rounded card of rows, footnote. */
export function ListSection({ title, footer, action, className, children }: ListSectionProps) {
  return (
    <section className={cn("mb-7", className)}>
      {(title || action) && (
        <div className="flex items-end justify-between px-4 pb-1.5">
          {title && <h2 className="text-[13px] tracking-wide text-muted-foreground uppercase">{title}</h2>}
          {action}
        </div>
      )}
      <div className="overflow-hidden rounded-xl bg-card text-card-foreground">{children}</div>
      {footer && <p className="px-4 pt-1.5 text-[13px] leading-snug text-muted-foreground">{footer}</p>}
    </section>
  );
}

type ListRowProps = {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-hand value / control. */
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  /** Shows the disclosure chevron (default: when href is set). */
  chevron?: boolean;
  destructive?: boolean;
  className?: string;
};

/** One 44pt+ row with an inset separator, like UITableViewCell. */
export function ListRow({ icon, title, subtitle, trailing, href, onClick, chevron, destructive, className }: ListRowProps) {
  const showChevron = chevron ?? Boolean(href);
  const content = (
    <>
      {icon && <span className="flex shrink-0 items-center">{icon}</span>}
      <span className="flex min-h-11 min-w-0 flex-1 items-center gap-3 border-b border-separator py-2.5 pr-4 group-last/row:border-b-0">
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[17px] leading-snug", destructive && "text-destructive")}>
            {title}
          </span>
          {subtitle && <span className="mt-0.5 block text-[14px] leading-snug text-muted-foreground">{subtitle}</span>}
        </span>
        {trailing && <span className="flex shrink-0 items-center text-[17px] text-muted-foreground">{trailing}</span>}
        {showChevron && <ChevronRight className="-mr-1 size-5 shrink-0 text-muted-foreground/60" />}
      </span>
    </>
  );
  const rowClassName = cn("group/row flex w-full items-center gap-3 pl-4 text-left", className);

  if (href) {
    return (
      <Link href={href} className={cn(rowClassName, "pressable")}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(rowClassName, "pressable")}>
        {content}
      </button>
    );
  }
  return <div className={rowClassName}>{content}</div>;
}

/** A row that wraps a form control with a label on the left. */
export function ListField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("group/row flex w-full items-center pl-4", className)}>
      <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 border-b border-separator py-1.5 pr-4 group-last/row:border-b-0">
        <label htmlFor={htmlFor} className="shrink-0 text-[17px]">
          {label}
        </label>
        <div className="flex min-w-0 flex-1 items-center justify-end text-[17px]">{children}</div>
      </div>
    </div>
  );
}

/** Borderless input that sits inside a ListField or a ListSection. */
export function ListInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full min-w-0 bg-transparent text-[17px] outline-none placeholder:text-muted-foreground/70",
        className,
      )}
      {...props}
    />
  );
}
