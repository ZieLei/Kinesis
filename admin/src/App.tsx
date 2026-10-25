import {
  Bell,
  Users,
  Sun,
  Moon,
  ChevronDown,
  Power,
  RotateCcw,
  Wrench,
  Check,
  X,
  Server,
  AlertTriangle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import TopbarButtonProps from "./components/TopbarButtonProps.tsx";
import Overview from "./views/Overview.tsx";
import Terminals from "./views/Terminals.tsx";
import Console from "./views/Console.tsx";
import Database from "./views/Database.tsx";
import Settings from "./views/Settings.tsx";

const tabs = [
  "Overview",
  "Terminals",
  "Console",
  "Database",
  "Settings",
] as const;

type Tab = (typeof tabs)[number];
type Theme = "light" | "dark";
type ServerAction = "restart" | "shutdown";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("kinesis-theme");

      if (saved === "light" || saved === "dark") {
        return saved;
      }

      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } catch {
      return "light";
    }
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [pendingAction, setPendingAction] = useState<ServerAction | null>(null);
  const [notice, setNotice] = useState("");

  const menuRef = useRef<HTMLDivElement>(null);

  // Apply the selected theme to the entire application.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");

    try {
      localStorage.setItem("kinesis-theme", theme);
    } catch {
      // The theme still works for the current session if storage is unavailable.
    }
  }, [theme]);

  // Close the server menu when clicking outside it or pressing Escape.
  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setPendingAction(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const toggleTheme = () => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  };

  const handleServerAction = (action: "maintenance" | ServerAction) => {
    setMenuOpen(false);
    setNotice("");

    if (action === "maintenance") {
      setMaintenanceMode((current) => {
        const next = !current;

        setNotice(
          next
            ? "Maintenance mode enabled in the UI preview only."
            : "Maintenance mode disabled in the UI preview only.",
        );

        return next;
      });

      return;
    }

    setPendingAction(action);
  };

  const confirmServerAction = () => {
    if (!pendingAction) return;

    // Backend integration is intentionally not implemented yet.
    setNotice(
      pendingAction === "restart"
        ? "Restart was not performed. Connect this action to the backend first."
        : "Shutdown was not performed. Connect this action to the backend first.",
    );

    setPendingAction(null);
  };

  return (
    <div className="min-h-screen bg-ctp-base p-5 text-ctp-text transition-colors duration-200 sm:p-8 lg:p-10">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-fredoka text-2xl text-ctp-text">Kinesis</p>
          <p className="mt-1 text-xs text-ctp-subtext0">
            Server administration
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            aria-pressed={theme === "dark"}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="flex h-11 items-center gap-2 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 text-ctp-text transition hover:bg-ctp-surface0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ctp-mauve"
          >
            {theme === "dark" ? (
              <Sun size={18} className="text-ctp-yellow" />
            ) : (
              <Moon size={18} className="text-ctp-mauve" />
            )}

            <span className="hidden text-sm font-medium sm:inline">
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </span>
          </button>

          {/* Notifications placeholder */}
          <button
            type="button"
            aria-label="Notifications"
            title="Notifications"
            onClick={() =>
              setNotice("Notifications are not connected to the backend yet.")
            }
            className="relative flex h-11 w-11 items-center justify-center rounded-lg border border-ctp-surface1 bg-ctp-mantle text-ctp-subtext1 transition hover:bg-ctp-surface0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ctp-mauve"
          >
            <Bell size={19} />
          </button>

          {/* Server action split button */}
          <div ref={menuRef} className="relative flex">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setPendingAction("shutdown");
              }}
              className="flex h-11 items-center gap-2 rounded-l-lg bg-ctp-red px-4 text-sm font-semibold text-ctp-base transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ctp-red focus-visible:ring-offset-2 focus-visible:ring-offset-ctp-base"
            >
              <Power size={17} />
              <span>Shut Down</span>
            </button>

            <button
              type="button"
              aria-label="More server actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-11 items-center justify-center rounded-r-lg border-l border-ctp-base/20 bg-ctp-red px-3 text-ctp-base transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ctp-red"
            >
              <ChevronDown
                size={17}
                className={`transition-transform duration-200 ${menuOpen ? "rotate-180" : ""
                  }`}
              />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl border border-ctp-surface1 bg-ctp-mantle p-1.5 shadow-xl shadow-black/10"
              >
                <div className="px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-ctp-subtext0">
                    Server actions
                  </p>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleServerAction("restart")}
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-ctp-surface0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ctp-mauve"
                >
                  <RotateCcw
                    size={17}
                    className="mt-0.5 shrink-0 text-ctp-blue"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ctp-text">
                      Restart server
                    </span>
                    <span className="mt-0.5 block text-xs text-ctp-subtext0">
                      Restart the API service
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleServerAction("maintenance")}
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-ctp-surface0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ctp-mauve"
                >
                  <Wrench
                    size={17}
                    className="mt-0.5 shrink-0 text-ctp-yellow"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ctp-text">
                      Maintenance mode
                    </span>
                    <span className="mt-0.5 block text-xs text-ctp-subtext0">
                      {maintenanceMode
                        ? "Currently enabled in preview"
                        : "Temporarily restrict terminal operations"}
                    </span>
                  </span>
                  {maintenanceMode && (
                    <Check
                      size={16}
                      className="mt-0.5 shrink-0 text-ctp-green"
                    />
                  )}
                </button>

                <div className="my-1.5 border-t border-ctp-surface0" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => handleServerAction("shutdown")}
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-ctp-red/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ctp-red"
                >
                  <Power
                    size={17}
                    className="mt-0.5 shrink-0 text-ctp-red"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ctp-red">
                      Shut down server
                    </span>
                    <span className="mt-0.5 block text-xs text-ctp-subtext0">
                      Stop the backend service
                    </span>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Connection status */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-ctp-subtext0" />
          <p className="text-sm text-ctp-subtext1">
            2 users connected
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {maintenanceMode && (
            <span className="flex items-center gap-1.5 rounded-md border border-ctp-yellow/25 bg-ctp-yellow/10 px-2.5 py-1 text-xs font-medium text-ctp-yellow">
              <Wrench size={13} />
              Maintenance preview
            </span>
          )}

          <span className="flex items-center gap-1.5 rounded-md border border-ctp-surface1 bg-ctp-mantle px-2.5 py-1 text-xs text-ctp-subtext0">
            <span className="h-1.5 w-1.5 rounded-full bg-ctp-yellow" />
            Backend not connected
          </span>
        </div>
      </div>

      {/* Action feedback */}
      {notice && (
        <div
          role="status"
          className="mt-5 flex items-start justify-between gap-3 rounded-lg border border-ctp-blue/20 bg-ctp-blue/5 px-4 py-3"
        >
          <div className="flex items-start gap-2.5">
            <Server size={16} className="mt-0.5 shrink-0 text-ctp-blue" />
            <p className="text-sm leading-relaxed text-ctp-subtext1">
              {notice}
            </p>
          </div>

          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
            className="shrink-0 rounded-md p-1 text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-text"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <nav
        aria-label="Dashboard sections"
        className="my-5 w-full overflow-x-auto rounded-lg border border-ctp-surface0 bg-ctp-surface2/20 p-2"
      >
        <div className="flex min-w-max flex-row gap-2">
          {tabs.map((tab) => (
            <TopbarButtonProps
              key={tab}
              active={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </TopbarButtonProps>
          ))}
        </div>
      </nav>

      {/* Active page */}
      <main>
        {activeTab === "Overview" && <Overview />}
        {activeTab === "Terminals" && <Terminals />}
        {activeTab === "Console" && <Console />}
        {activeTab === "Database" && <Database />}
        {activeTab === "Settings" && <Settings />}
      </main>

      {/* Server action confirmation */}
      {pendingAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ctp-crust/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPendingAction(null);
            }
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="server-action-title"
            aria-describedby="server-action-description"
            className="w-full max-w-md rounded-2xl border border-ctp-surface1 bg-ctp-mantle p-6 shadow-2xl"
          >
            <div
              className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${pendingAction === "shutdown"
                  ? "bg-ctp-red/10 text-ctp-red"
                  : "bg-ctp-yellow/10 text-ctp-yellow"
                }`}
            >
              {pendingAction === "shutdown" ? (
                <Power size={23} />
              ) : (
                <AlertTriangle size={23} />
              )}
            </div>

            <h2
              id="server-action-title"
              className="text-lg font-semibold text-ctp-text"
            >
              {pendingAction === "shutdown"
                ? "Shut down the server?"
                : "Restart the server?"}
            </h2>

            <p
              id="server-action-description"
              className="mt-2 text-sm leading-relaxed text-ctp-subtext0"
            >
              {pendingAction === "shutdown"
                ? "Stopping the backend may disconnect all terminals and interrupt new sales until the service starts again."
                : "Restarting the backend may temporarily disconnect terminals. Pending offline sales should remain safely queued on each terminal."}
            </p>

            <div className="mt-4 flex items-start gap-2 rounded-lg border border-ctp-yellow/20 bg-ctp-yellow/5 p-3">
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-ctp-yellow"
              />
              <p className="text-xs leading-relaxed text-ctp-subtext0">
                Backend actions are not implemented yet. Confirming here will
                only display a notice; it will not stop or restart anything.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="rounded-lg border border-ctp-surface1 px-4 py-2.5 text-sm font-medium text-ctp-subtext1 transition hover:bg-ctp-surface0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ctp-mauve"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmServerAction}
                className={`rounded-lg px-4 py-2.5 text-sm font-semibold text-ctp-base transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 ${pendingAction === "shutdown"
                    ? "bg-ctp-red focus-visible:ring-ctp-red"
                    : "bg-ctp-yellow focus-visible:ring-ctp-yellow"
                  }`}
              >
                {pendingAction === "shutdown"
                  ? "Confirm shutdown"
                  : "Confirm restart"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
