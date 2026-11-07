import type { ReactNode } from "react";
import { focusRing } from "./ui/styles";

export default function TabButton({
  children,
  active,
  onClick,
  compact = false,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 text-sm transition-colors ${compact ? "py-2.5" : "py-2.5"
        } ${focusRing} ${active
          ? "border-ctp-mauve font-medium text-ctp-text"
          : "border-transparent text-ctp-subtext1 hover:border-ctp-surface1 hover:text-ctp-text"
        }`}
    >
      {children}
    </button>
  );
}
