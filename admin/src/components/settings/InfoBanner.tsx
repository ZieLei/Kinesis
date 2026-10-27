import { Info } from "lucide-react";

export default function InfoBanner() {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-ctp-blue/20 bg-ctp-blue/5 px-3 py-2.5">
      <Info size={16} className="mt-0.5 shrink-0 text-ctp-blue" />
      <p className="text-xs leading-relaxed text-ctp-subtext0">
        Changes currently affect this page only. Connect the backend to persist settings and distribute them to terminals.
      </p>
    </div>
  );
}
