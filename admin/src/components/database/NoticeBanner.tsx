import { Info, X } from "lucide-react";

export default function NoticeBanner({
  notice,
  onDismiss,
}: {
  notice: string;
  onDismiss: () => void;
}) {
  if (!notice) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-ctp-blue/20 bg-ctp-blue/5 p-3"
    >
      <Info size={15} className="mt-0.5 shrink-0 text-ctp-blue" />
      <p className="flex-1 font-line-seed text-xs leading-5 text-ctp-subtext1">
        {notice}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 rounded p-1 text-ctp-subtext0 hover:text-ctp-text"
      >
        <X size={14} />
      </button>
    </div>
  );
}
