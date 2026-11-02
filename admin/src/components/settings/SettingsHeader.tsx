
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Settings2,
} from "lucide-react";

import { useAuth } from "../../auth/AuthProvider";

export default function SettingsHeader() {
  const { status } = useAuth();

  const isAuthenticated = status === "authenticated";
  const isLoading = status === "loading";
  const isUnavailable = status === "unavailable";

  const containerClass = isAuthenticated
    ? "border-ctp-green/25 bg-ctp-green/10"
    : isUnavailable
      ? "border-ctp-red/25 bg-ctp-red/10"
      : "border-ctp-yellow/25 bg-ctp-yellow/10";

  const textClass = isAuthenticated
    ? "text-ctp-green"
    : isUnavailable
      ? "text-ctp-red"
      : "text-ctp-yellow";

  const statusLabel = isAuthenticated
    ? "Session active"
    : isLoading
      ? "Checking session"
      : isUnavailable
        ? "Session unavailable"
        : "Session expired";

  const statusDescription = isAuthenticated
    ? "Administrator authenticated"
    : isLoading
      ? "Verifying administrator session"
      : isUnavailable
        ? "Could not verify administrator session"
        : "Authentication required";

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

      <div
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${containerClass}`}
        role="status"
        aria-live="polite"
      >
        {isAuthenticated ? (
          <CircleCheck
            size={15}
            className="shrink-0 text-ctp-green"
          />
        ) : isLoading ? (
          <LoaderCircle
            size={15}
            className="shrink-0 animate-spin text-ctp-yellow"
          />
        ) : (
          <CircleAlert
            size={15}
            className={`shrink-0 ${textClass}`}
          />
        )}

        <div>
          <p className={`text-xs font-semibold ${textClass}`}>
            {statusLabel}
          </p>

          <p className="mt-0.5 text-[10px] text-ctp-subtext0">
            {statusDescription}
          </p>
        </div>
      </div>
    </header>
  );
}
