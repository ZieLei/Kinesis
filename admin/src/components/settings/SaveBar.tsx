import {
  buttonPrimary,
  buttonQuiet,
  buttonSecondary,
} from "./styles";

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
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ctp-surface0 bg-ctp-base px-3 py-2.5 sm:px-6">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
        <p
          role="status"
          aria-live="polite"
          className="min-w-0 flex-1 text-xs"
        >
          {showSaveNotice ? (
            <span className="text-ctp-yellow">{noticeMessage}</span>
          ) : hasChanges ? (
            <span className="inline-flex items-center gap-2 font-medium text-ctp-text">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full bg-ctp-yellow"
              />
              Unsaved changes
            </span>
          ) : (
            <span className="text-ctp-subtext0">No unsaved changes</span>
          )}
        </p>

        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={onReset} className={buttonQuiet}>
            Reset to defaults
          </button>

          <button
            type="button"
            onClick={onDiscard}
            disabled={!hasChanges}
            className={buttonSecondary}
          >
            Discard
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={!hasChanges}
            className={buttonPrimary}
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
