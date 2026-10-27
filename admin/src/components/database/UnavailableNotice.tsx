import type { ReactNode } from "react";
import { Info } from "lucide-react";

export default function UnavailableNotice({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-ctp-yellow/20 bg-ctp-yellow/5 p-3">
      <Info size={15} className="mt-0.5 shrink-0 text-ctp-yellow" />
      <p className="font-line-seed text-xs leading-5 text-ctp-subtext1">
        {children}
      </p>
    </div>
  );
}
