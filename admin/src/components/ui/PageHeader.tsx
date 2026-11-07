import type { ReactNode } from "react";

export default function PageHeader({
  title,
  description,
  meta,
  status,
  actions,
}: {
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-ctp-surface0 pb-4">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-ctp-text">{title}</h1>
        {description && (
          <p className="mt-0.5 text-xs text-ctp-subtext0">{description}</p>
        )}
        {meta && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ctp-subtext0">
            {meta}
          </div>
        )}
      </div>

      {(status || actions) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {status}
          {actions && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
      )}
    </header>
  );
}
