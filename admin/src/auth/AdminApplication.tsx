
import { useState } from "react";

import {
  Activity,
  AlertCircle,
  LoaderCircle,
  LogOut,
  RefreshCw,
  UserRound,
} from "lucide-react";

import { useAuth } from "./AuthProvider";

import Login from "../views/Login";
import Dashboard from "../App";


// --------------------------------------------------
// Application loading screen
// --------------------------------------------------


function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ctp-base font-line-seed text-ctp-text">
      <div className="flex flex-col items-center text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-ctp-surface1 bg-ctp-mantle">
          <Activity
            size={26}
            className="text-ctp-mauve"
          />
        </div>

        <h1 className="mt-4 font-fredoka text-2xl">
          Kinesis
        </h1>

        <div className="mt-6 flex items-center gap-2 text-sm text-ctp-subtext0">
          <LoaderCircle
            size={16}
            className="animate-spin"
          />

          Restoring administrator session...
        </div>
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
      <section className="w-full max-w-md rounded-2xl border border-ctp-surface1 bg-ctp-mantle p-6 text-center shadow-xl">
        <div className="mx-auto flex size-14 items-center justify-center rounded-xl bg-ctp-red/10 text-ctp-red">
          <AlertCircle size={27} />
        </div>

        <h1 className="mt-5 font-fredoka text-2xl">
          Kinesis
        </h1>

        <h2 className="mt-3 text-base font-bold">
          Server unavailable
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-ctp-subtext0">
          The administrator authentication service could not
          be reached. Your existing browser session has not
          been intentionally cleared.
        </p>

        {message && (
          <p className="mt-4 break-words rounded-lg border border-ctp-red/20 bg-ctp-red/5 p-3 text-xs text-ctp-red">
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={() => void onRetry()}
          disabled={loading}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ctp-mauve px-4 py-3 text-sm font-bold text-ctp-base transition hover:bg-ctp-mauve/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={loading ? "animate-spin" : ""}
          />

          Retry connection
        </button>
      </section>
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
    <div className="min-h-screen bg-ctp-base">
      {/* Administrator session bar */}
      <header className="relative z-[90] flex flex-wrap items-center justify-between gap-3 border-b border-ctp-surface0 bg-ctp-mantle px-5 py-2.5 sm:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-ctp-green/10 text-ctp-green">
            <UserRound size={15} />
          </div>

          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-ctp-text">
              {user?.username ?? "Administrator"}
            </p>

            <p className="text-[10px] text-ctp-subtext0">
              Authenticated administrator
            </p>
          </div>
        </div>


        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-ctp-surface1 px-3 py-1.5 text-xs font-semibold text-ctp-subtext1 transition hover:border-ctp-red/40 hover:bg-ctp-red/5 hover:text-ctp-red disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loggingOut ? (
            <LoaderCircle
              size={13}
              className="animate-spin"
            />
          ) : (
            <LogOut size={13} />
          )}

          {loggingOut ? "Signing out..." : "Sign out"}
        </button>


        {logoutError && (
          <div
            role="alert"
            className="absolute right-5 top-full z-[100] mt-2 max-w-sm rounded-lg border border-ctp-red/20 bg-ctp-mantle px-3 py-2 text-xs text-ctp-red shadow-xl sm:right-8"
          >
            {logoutError}
          </div>
        )}
      </header>


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
