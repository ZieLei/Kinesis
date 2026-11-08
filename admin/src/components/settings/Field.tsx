import type { ReactNode } from "react";
import { labelClass } from "./styles";

export default function Field({
  label,
  description,
  htmlFor,
  descriptionId,
  stacked = false,
  notInEffect,
  notInEffectId,
  children,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  descriptionId?: string;
  stacked?: boolean;
  notInEffect?: string;
  notInEffectId?: string;
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
          {notInEffect && (
            <span className="ml-2 inline-block rounded border border-ctp-yellow/40 bg-ctp-yellow/10 px-1.5 py-px align-middle text-[10px] font-medium uppercase tracking-wide text-ctp-yellow">
              Not in effect
            </span>
          )}
        </label>
        {description && (
          <p
            id={descriptionId}
            className="mt-0.5 text-xs leading-relaxed text-ctp-subtext0"
          >
            {description}
          </p>
        )}
        {notInEffect && (
          <p
            id={notInEffectId}
            className="mt-1 text-xs leading-relaxed text-ctp-yellow"
          >
            {notInEffect}
          </p>
        )}
      </div>

      <div className={stacked ? "mt-2" : "mt-2 sm:mt-0"}>{children}</div>
    </div>
  );
}
