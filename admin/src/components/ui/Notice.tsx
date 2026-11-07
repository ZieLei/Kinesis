import { X } from "lucide-react";
import type { ReactNode } from "react";

export type NoticeTone = "info" | "warning" | "danger" | "success";

const toneClass: Record<NoticeTone, string> = {
  info: "border-ctp-blue bg-ctp-blue/5",
  warning: "border-ctp-yellow bg-ctp-yellow/5",
  danger: "border-ctp-red bg-ctp-red/5",
  success: "border-ctp-green bg-ctp-green/5",
};

const titleClass: Record<NoticeTone, string> = {
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
  onDismiss,
  className = "",
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status" | "note";
  onDismiss?: () => void;
  className?: string;
}) {
  const resolvedRole =
    role ?? (tone === "danger" || tone === "warning" ? "alert" : "status");

  return (
    <div
      role={resolvedRole}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-r-md border-l-2 px-3 py-2.5 ${toneClass[tone]} ${className}`}
    >
      <div className="min-w-0 flex-1 text-sm">
        {title && (
          <p className={`font-medium ${titleClass[tone]}`}>{title}</p>
        )}
        {children && (
          <div
            className={`break-words text-xs leading-relaxed text-ctp-subtext1 ${title ? "mt-0.5" : ""
              }`}
          >
            {children}
          </div>
        )}
      </div>
      {(action || onDismiss) && (
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {onDismiss && (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={onDismiss}
              className="rounded p-1 text-ctp-subtext0 transition hover:bg-ctp-surface0 hover:text-ctp-text"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
