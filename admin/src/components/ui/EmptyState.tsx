import type { ReactNode } from "react";

export default function EmptyState({
  title,
  description,
  action,
  bordered = true,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  bordered?: boolean;
}) {
  return (
    <div
      className={`py-8 ${bordered ? "border-y border-ctp-surface0" : ""}`}
    >
      <p className="text-sm font-medium text-ctp-text">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-ctp-subtext0">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
