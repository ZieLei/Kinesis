import { useAuth } from "../../auth/AuthProvider";

export default function SettingsHeader() {
  const { status } = useAuth();

  const isAuthenticated = status === "authenticated";
  const isLoading = status === "loading";
  const isUnavailable = status === "unavailable";

  const dotClass = isAuthenticated
    ? "bg-ctp-green"
    : isUnavailable
      ? "bg-ctp-red"
      : "bg-ctp-yellow";

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
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-ctp-surface0 pb-4">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-ctp-text">
          System settings
        </h1>
        <p className="mt-0.5 text-xs text-ctp-subtext0">
          POS policies, inventory, receipts, permissions, and server.
        </p>
      </div>

      <div
        className="flex items-center gap-2 text-xs"
        role="status"
        aria-live="polite"
      >
        <span
          aria-hidden="true"
          className={`size-2 shrink-0 rounded-full ${dotClass} ${isLoading ? "animate-pulse" : ""
            }`}
        />
        <span className={`font-medium ${textClass}`}>{statusLabel}</span>
        <span className="hidden text-ctp-subtext0 sm:inline">
          {statusDescription}
        </span>
      </div>
    </header>
  );
}
