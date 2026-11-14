
import { useState } from "react";

import { LoaderCircle, RefreshCw } from "lucide-react";

import Notice from "../components/ui/Notice";
import StatusDot from "../components/ui/StatusDot";
import { buttonPrimary, buttonQuiet, buttonSmall } from "../components/ui/styles";
import { useAuth } from "./AuthProvider";

import Login from "../views/Login";
import SecurityDialog from "../components/SecurityDialog";
import Dashboard from "../App";


// --------------------------------------------------
// Application loading screen
// --------------------------------------------------


function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ctp-base font-line-seed text-ctp-text">
      <div className="text-center">
        <h1 className="font-fredoka text-3xl">
          Kinesis
        </h1>

        <p
          role="status"
          className="mt-3 flex items-center justify-center gap-2 text-xs text-ctp-subtext0"
        >
          <LoaderCircle
            size={14}
            aria-hidden="true"
            className="animate-spin"
          />

          Restoring administrator session…
        </p>
      </div>
    </main>
  );
}


// --------------------------------------------------
// Backend unavailable
// --------------------------------------------------


function BackendUnavailable({
  message,
  onRetry,
  loading,
}: {
  message: string | null;
  onRetry: () => Promise<void>;
  loading: boolean;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ctp-base px-4 py-10 font-line-seed text-ctp-text">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center font-fredoka text-3xl">
          Kinesis
        </h1>

        <section
          aria-labelledby="server-unavailable-heading"
          className="rounded-lg border border-ctp-surface0 bg-ctp-mantle px-6 py-5"
        >
          <StatusDot tone="danger">Server unavailable</StatusDot>

          <h2
            id="server-unavailable-heading"
            className="mt-2 text-sm font-semibold"
          >
            Could not reach the authentication service
          </h2>

          <p className="mt-1 text-xs leading-relaxed text-ctp-subtext0">
            The administrator authentication service could not
            be reached. Your existing browser session has not
            been intentionally cleared.
          </p>

          {message && (
            <Notice tone="danger" role="alert" className="mt-4">
              {message}
            </Notice>
          )}

          <button
            type="button"
            onClick={() => void onRetry()}
            disabled={loading}
            className={`${buttonPrimary} mt-5 w-full !py-2`}
          >
            <RefreshCw
              size={14}
              aria-hidden="true"
              className={loading ? "animate-spin" : ""}
            />

            Retry connection
          </button>
        </section>
      </div>
    </main>
  );
}


// --------------------------------------------------
// Authenticated dashboard
// --------------------------------------------------


function AuthenticatedDashboard() {
  const {
    user,
    logout,
  } = useAuth();

  const [loggingOut, setLoggingOut] =
    useState(false);

  const [logoutError, setLogoutError] =
    useState("");

  const [showSecurity, setShowSecurity] = useState(false);


  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);
    setLogoutError("");

    try {
      await logout();
    } catch (error) {
      setLogoutError(
        error instanceof Error
          ? error.message
          : "Could not end the administrator session.",
      );
    } finally {
      setLoggingOut(false);
    }
  };


  return (
    <div className="min-h-screen bg-ctp-base font-line-seed">
      {/* Administrator session bar */}
      <header className="relative z-[90] border-b border-ctp-surface0 bg-ctp-mantle px-5 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 py-1.5">
          <p className="flex min-w-0 items-center gap-2 text-xs">
            <StatusDot tone="success" />
            <span className="truncate font-medium text-ctp-text">
              {user?.username ?? "Administrator"}
            </span>
            <span className="hidden text-ctp-subtext0 sm:inline">
              Authenticated administrator
            </span>
          </p>

          <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowSecurity(true)}
            className={`${buttonQuiet} ${buttonSmall}`}
          >
            Two-step sign-in
          </button>

          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className={`${buttonQuiet} ${buttonSmall}`}
          >
            {loggingOut && (
              <LoaderCircle
                size={13}
                aria-hidden="true"
                className="animate-spin"
              />
            )}

            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
          </div>
        </div>

        {logoutError && (
          <div className="mx-auto max-w-[1500px] pb-2">
            <Notice
              tone="danger"
              role="alert"
              onDismiss={() => setLogoutError("")}
            >
              {logoutError}
            </Notice>
          </div>
        )}
      </header>


      {showSecurity && <SecurityDialog onClose={() => setShowSecurity(false)} />}

      {/* Existing dashboard */}
      <Dashboard />
    </div>
  );
}


// --------------------------------------------------
// Application authentication gate
// --------------------------------------------------


export default function AdminApplication() {
  const {
    status,
    error,
    refreshSession,
  } = useAuth();

  switch (status) {
    case "loading":
      return <LoadingScreen />;

    case "unavailable":
      return (
        <BackendUnavailable
          message={error}
          onRetry={refreshSession}
          loading={false}
        />
      );

    case "unauthenticated":
      return <Login />;

    case "authenticated":
      return <AuthenticatedDashboard />;

    default:
      return <LoadingScreen />;
  }
}
