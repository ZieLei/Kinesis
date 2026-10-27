import type { Database as DatabaseIcon } from "lucide-react";

export default function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof DatabaseIcon;
  color: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="font-line-seed text-xs text-ctp-subtext0">{label}</p>
        <p className="mt-0.5 truncate font-line-seed text-base font-bold text-ctp-text">
          {value}
        </p>
        <p className="mt-0.5 truncate font-line-seed text-[10px] text-ctp-subtext0">
          {detail}
        </p>
      </div>
    </div>
  );
}
