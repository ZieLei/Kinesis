import type { ReactNode } from "react";

export default function Section({
  id,
  title,
  description,
  badge,
  actions,
  children,
  className = "",
  bodyClassName = "space-y-6",
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const headingId = id ? `${id}-heading` : undefined;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`min-w-0 scroll-mt-4 ${className}`}
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 id={headingId} className="text-sm font-semibold text-ctp-text">
              {title}
            </h2>
            {typeof badge === "string" || typeof badge === "number" ? (
              <Badge>{badge}</Badge>
            ) : (
              badge
            )}
          </div>
          {description && (
            <p className="mt-0.5 text-xs leading-relaxed text-ctp-subtext0">
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "warning" | "danger" | "success";
}) {
  const toneClass = {
    neutral: "bg-ctp-surface0 text-ctp-subtext1",
    accent: "bg-ctp-mauve/10 text-ctp-mauve",
    warning: "bg-ctp-yellow/10 text-ctp-yellow",
    danger: "bg-ctp-red/10 text-ctp-red",
    success: "bg-ctp-green/10 text-ctp-green",
  }[tone];

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide tabular-nums ${toneClass}`}
    >
      {children}
    </span>
  );
}
