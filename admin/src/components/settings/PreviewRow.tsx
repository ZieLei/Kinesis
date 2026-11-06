import type { ReactNode } from "react";

export default function PreviewRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
      <span className="text-sm text-ctp-subtext0">{label}</span>
      <span className="text-sm font-medium tabular-nums text-ctp-text">
        {children}
      </span>
    </div>
  );
}
