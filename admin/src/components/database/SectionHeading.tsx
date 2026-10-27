import type { Database as DatabaseIcon } from "lucide-react";

export default function SectionHeading({
  icon: Icon,
  title,
  description,
  color = "text-ctp-mauve",
}: {
  icon: typeof DatabaseIcon;
  title: string;
  description: string;
  color?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ctp-surface0 ${color}`}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <h2 className="font-line-seed text-sm font-bold text-ctp-text">
          {title}
        </h2>
        <p className="mt-0.5 font-line-seed text-xs text-ctp-subtext0">
          {description}
        </p>
      </div>
    </div>
  );
}
