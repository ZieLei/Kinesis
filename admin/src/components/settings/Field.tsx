import type { ReactNode } from "react";
import { labelClass } from "./styles";

export default function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className={labelClass}>{label}</label>
      {children}
      {description && (
        <p className="mt-1 text-xs leading-relaxed text-ctp-subtext0">
          {description}
        </p>
      )}
    </div>
  );
}
