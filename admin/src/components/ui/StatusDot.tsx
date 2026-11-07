import type { ReactNode } from "react";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const dotClass: Record<StatusTone, string> = {
  success: "bg-ctp-green",
  warning: "bg-ctp-yellow",
  danger: "bg-ctp-red",
  info: "bg-ctp-blue",
  neutral: "bg-ctp-overlay0",
};

const textClass: Record<StatusTone, string> = {
  success: "text-ctp-green",
  warning: "text-ctp-yellow",
  danger: "text-ctp-red",
  info: "text-ctp-blue",
  neutral: "text-ctp-subtext0",
};

/** Coloured dot followed by a sentence-case label. */
export default function StatusDot({
  tone,
  children,
  pulse = false,
  muted = false,
  className = "",
  title,
}: {
  tone: StatusTone;
  children?: ReactNode;
  pulse?: boolean;
  /** Render the label in the neutral text colour instead of the tone colour. */
  muted?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex min-w-0 items-center gap-1.5 text-xs font-medium ${muted ? "text-ctp-subtext1" : textClass[tone]
        } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${dotClass[tone]} ${pulse ? "animate-pulse" : ""
          }`}
      />
      {children !== undefined && <span className="truncate">{children}</span>}
    </span>
  );
}
