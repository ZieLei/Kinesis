import { CircleAlert, Settings2 } from "lucide-react";

export default function SettingsHeader() {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-ctp-subtext0">
          <Settings2 size={13} />
          <span>ADMINISTRATION</span>
          <span className="text-ctp-overlay0">/</span>
          <span className="text-ctp-mauve">SETTINGS</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-ctp-text">
          System settings
        </h1>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ctp-subtext0">
          Configure POS policies, inventory, receipts, permissions, and the server.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-ctp-yellow/25 bg-ctp-yellow/10 px-3 py-2">
        <CircleAlert size={15} className="shrink-0 text-ctp-yellow" />
        <div>
          <p className="text-xs font-semibold text-ctp-yellow">
            Backend not connected
          </p>
          <p className="mt-0.5 text-[10px] text-ctp-subtext0">Preview only</p>
        </div>
      </div>
    </header>
  );
}
