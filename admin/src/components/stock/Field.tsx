import type { ReactNode } from "react";

import { labelClass } from "../ui/styles";


/** Label, control and optional hint, as used in the Stock page dialogs. */
export default function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ctp-subtext0">{hint}</p>}
    </div>
  );
}
