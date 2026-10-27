import { LockKeyhole } from "lucide-react";

export default function SecurityFooter() {
  return (
    <footer className="flex items-start gap-2.5 rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
      <LockKeyhole size={16} className="mt-0.5 shrink-0 text-ctp-overlay1" />
      <div>
        <h3 className="font-line-seed text-xs font-bold text-ctp-text">
          Database security
        </h3>
        <p className="mt-1 font-line-seed text-[11px] leading-5 text-ctp-subtext0">
          Require administrator authentication for database operations.
          Restrict SQL permissions, use parameterized queries where
          applicable, enforce timeouts, and audit destructive actions. Never
          expose database credentials or unrestricted SQL execution to clients.
        </p>
      </div>
    </footer>
  );
}
