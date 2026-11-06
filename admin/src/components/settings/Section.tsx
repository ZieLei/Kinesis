import type { ReactNode } from "react";

export default function Section({
  id,
  title,
  description,
  children,
  badge,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
  badge?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={`${id}-heading`}
            className="text-sm font-semibold text-ctp-text"
          >
            {title}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-ctp-subtext0">
            {description}
          </p>
        </div>

        {badge && (
          <span className="shrink-0 rounded bg-ctp-surface0 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ctp-subtext1">
            {badge}
          </span>
        )}
      </div>

      <div className="space-y-6">{children}</div>
    </section>
  );
}
