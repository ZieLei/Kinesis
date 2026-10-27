import { Check, Info, RotateCcw, Save } from "lucide-react";

export default function SaveBar({
  showSaveNotice,
  noticeMessage,
  hasChanges,
  onDiscard,
  onReset,
  onSave,
}: {
  showSaveNotice: boolean;
  noticeMessage: string;
  hasChanges: boolean;
  onDiscard: () => void;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-ctp-surface0 bg-ctp-base/95 px-3 py-2.5 backdrop-blur-xl sm:px-6">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {showSaveNotice ? (
            <div className="flex items-start gap-2 text-xs text-ctp-yellow">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>{noticeMessage}</span>
            </div>
          ) : hasChanges ? (
            <div className="flex items-center gap-2 text-xs text-ctp-yellow">
              <span className="size-2 shrink-0 rounded-full bg-ctp-yellow" />
              Unsaved changes
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-ctp-subtext0">
              <Check size={14} className="text-ctp-green" />
              No unsaved changes
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={!hasChanges}
            className="flex items-center gap-1.5 rounded-lg border border-ctp-surface1 px-3 py-2 text-xs font-medium text-ctp-subtext1 transition hover:bg-ctp-surface0 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">Discard</span>
          </button>

          <button
            type="button"
            onClick={onReset}
            className="rounded-lg border border-ctp-surface1 px-3 py-2 text-xs font-medium text-ctp-subtext1 transition hover:bg-ctp-surface0"
          >
            Reset defaults
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={!hasChanges}
            className="flex items-center gap-1.5 rounded-lg bg-ctp-mauve px-3.5 py-2 text-xs font-semibold text-ctp-base transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save size={14} />
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
