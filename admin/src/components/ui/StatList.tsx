import type { ReactNode } from "react";

export type StatItem = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  valueClassName?: string;
};

/**
 * A single ruled strip of figures. Use instead of rows of metric cards.
 */
export default function StatList({
  items,
  className = "",
}: {
  items: StatItem[];
  className?: string;
}) {
  return (
    <dl
      className={`grid grid-cols-2 border-y border-ctp-surface0 sm:flex sm:flex-wrap sm:divide-x sm:divide-ctp-surface0 ${className}`}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className="min-w-0 py-3 pr-4 sm:flex-1 sm:px-4 sm:first:pl-0"
        >
          <dt className="truncate text-xs text-ctp-subtext0">{item.label}</dt>
          <dd
            className={`mt-1 truncate text-base font-semibold tabular-nums text-ctp-text ${item.valueClassName ?? ""
              }`}
          >
            {item.value}
          </dd>
          {item.hint && (
            <dd className="mt-0.5 truncate text-xs text-ctp-subtext0">
              {item.hint}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

/** Key/value rows in a ruled list (the Settings preview-row pattern). */
export function KeyValueList({
  items,
  className = "",
}: {
  items: { label: ReactNode; value: ReactNode; key?: string }[];
  className?: string;
}) {
  return (
    <dl
      className={`divide-y divide-ctp-surface0 border-y border-ctp-surface0 ${className}`}
    >
      {items.map((item, index) => (
        <div
          key={item.key ?? index}
          className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2.5"
        >
          <dt className="text-sm text-ctp-subtext0">{item.label}</dt>
          <dd className="min-w-0 break-words text-right text-sm font-medium tabular-nums text-ctp-text">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
