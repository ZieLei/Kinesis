import { useAuth } from "../../auth/AuthProvider";
import PageHeader from "../ui/PageHeader";
import StatusDot from "../ui/StatusDot";

export default function SettingsHeader() {
  const { status } = useAuth();

  const isAuthenticated = status === "authenticated";
  const isLoading = status === "loading";
  const isUnavailable = status === "unavailable";

  const tone = isAuthenticated ? "success" : isUnavailable ? "danger" : "warning";

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
    <PageHeader
      title="System settings"
      description="POS policies, inventory, receipts, permissions, and server."
      status={
        <div
          className="flex items-center gap-2 text-xs"
          role="status"
          aria-live="polite"
        >
          <StatusDot tone={tone} pulse={isLoading}>
            {statusLabel}
          </StatusDot>
          <span className="hidden text-ctp-subtext0 sm:inline">
            {statusDescription}
          </span>
        </div>
      }
    />
  );
}
