import type { ReactNode } from "react";

type Tone = "info" | "warning" | "danger" | "success";

const toneClass: Record<Tone, string> = {
  info: "border-ctp-blue bg-ctp-blue/5",
  warning: "border-ctp-yellow bg-ctp-yellow/5",
  danger: "border-ctp-red bg-ctp-red/5",
  success: "border-ctp-green bg-ctp-green/5",
};

const titleClass: Record<Tone, string> = {
  info: "text-ctp-blue",
  warning: "text-ctp-yellow",
  danger: "text-ctp-red",
  success: "text-ctp-green",
};

export default function Notice({
  tone = "info",
  title,
  children,
  action,
  role,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status" | "note";
}) {
  const resolvedRole =
    role ?? (tone === "danger" || tone === "warning" ? "alert" : "status");

  return (
    <div
      role={resolvedRole}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-r-md border-l-2 px-3 py-2.5 ${toneClass[tone]}`}
    >
      <div className="min-w-0 flex-1 text-sm">
        {title && (
          <p className={`font-medium ${titleClass[tone]}`}>{title}</p>
        )}
        <div
          className={`break-words text-xs leading-relaxed text-ctp-subtext1 ${title ? "mt-0.5" : ""
            }`}
        >
          {children}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
