import type { ReactNode } from "react";
import { labelClass } from "./styles";

export default function Field({
  label,
  description,
  htmlFor,
  descriptionId,
  stacked = false,
  children,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  descriptionId?: string;
  stacked?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`min-w-0 py-3 ${stacked
          ? ""
          : "sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-start sm:gap-x-8"
        }`}
    >
      <div className={`min-w-0 ${stacked ? "" : "sm:pt-1.5"}`}>
        <label htmlFor={htmlFor} className={labelClass}>
          {label}
        </label>
        {description && (
          <p
            id={descriptionId}
            className="mt-0.5 text-xs leading-relaxed text-ctp-subtext0"
          >
            {description}
          </p>
        )}
      </div>

      <div className={stacked ? "mt-2" : "mt-2 sm:mt-0"}>{children}</div>
    </div>
  );
}
