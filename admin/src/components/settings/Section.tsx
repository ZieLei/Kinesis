import type { ElementType, ReactNode } from "react";

export default function Section({
  id,
  icon: Icon,
  title,
  description,
  children,
  badge,
}: {
  id: string;
  icon: ElementType;
  title: string;
  description: string;
  children: ReactNode;
  badge?: string;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-5 overflow-hidden rounded-xl border border-ctp-surface0 bg-ctp-mantle"
    >
      <div className="flex items-start gap-3 border-b border-ctp-surface0 px-4 py-3">
        <div className="rounded-lg border border-ctp-surface1 bg-ctp-base p-1.5 text-ctp-mauve">
          <Icon size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ctp-text">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-ctp-subtext0">
            {description}
          </p>
        </div>
        {badge && (
          <span className="shrink-0 rounded-md bg-ctp-surface0 px-2 py-1 text-[10px] font-semibold text-ctp-subtext1">
            {badge}
          </span>
        )}
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}
