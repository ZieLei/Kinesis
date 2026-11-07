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
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import TabButton from "./components/TabButton";
import Notice from "./components/ui/Notice";
import Dialog from "./components/ui/Dialog";
import StatusDot from "./components/ui/StatusDot";
import {
  buttonDangerSolid,
  buttonSecondary,
  focusRing,
  iconButton,
} from "./components/ui/styles";
import Overview from "./views/Overview";
import Cashiers from "./views/Cashiers";
import Terminals from "./views/Terminals";
import Console from "./views/Console";
import Database from "./views/Database";
import Settings from "./views/Settings";

import { API_BASE_URL, apiRequest } from "./lib/api";


const tabs = [
  "Overview",
  "Cashiers",
  "Terminals",
  "Console",
  "Database",
  "Settings",
] as const;

type Tab = (typeof tabs)[number];
type Theme = "light" | "dark";
type ServerAction = "restart" | "shutdown";
type BackendStatus = "checking" | "connected" | "disconnected";

type BackendHealthResponse = {
  status: string;
  database: string;
  message: string;
};

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

  const [pendingAction, setPendingAction] =
    useState<ServerAction | null>(null);

  const [notice, setNotice] = useState("");
  const [compactHeader, setCompactHeader] = useState(false);

  const [backendStatus, setBackendStatus] =
    useState<BackendStatus>("checking");

  const menuRef = useRef<HTMLDivElement>(null);
  const floatingMenuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // Check whether FastAPI and PostgreSQL are operational.
  useEffect(() => {
    let cancelled = false;
    let requestInFlight = false;
    let activeController: AbortController | null = null;

    const checkBackend = async () => {
      if (requestInFlight || cancelled) return;

      requestInFlight = true;

      const controller = new AbortController();
      activeController = controller;

      let timedOut = false;

      const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 4000);

      try {
        const health = await apiRequest<BackendHealthResponse>(
          "/api/health",
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (
          health.status !== "online" ||
          health.database !== "online"
        ) {
          throw new Error("Backend or database is unavailable.");
        }

        if (!cancelled) {
          setBackendStatus("connected");
        }
      } catch {
        if (!cancelled && (!controller.signal.aborted || timedOut)) {
          setBackendStatus("disconnected");
        }
      } finally {
        window.clearTimeout(timeout);
        requestInFlight = false;

        if (activeController === controller) {
          activeController = null;
        }
      }
    };

    void checkBackend();

    const interval = window.setInterval(() => {
      void checkBackend();
    }, 5000);

    return () => {
      cancelled = true;

      window.clearInterval(interval);
      activeController?.abort();
    };
  }, []);

  // Show the compact floating bar after the main header scrolls out of view.
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setCompactHeader(
          !entry.isIntersecting && window.scrollY > 120,
        );
      },
      { threshold: 0 },
    );

    observer.observe(header);

    const handleScroll = () => {
      setCompactHeader(
        window.scrollY > Math.max(120, header.offsetHeight * 0.75),
      );
    };

    window.addEventListener("scroll", handleScroll, {
      passive: true,
    });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Apply the selected theme to the entire application.
  useEffect(() => {
    document.documentElement.classList.toggle(
      "dark",
      theme === "dark",
    );

    try {
      localStorage.setItem("kinesis-theme", theme);
    } catch {
      // The theme still works for the current session if storage is unavailable.
    }
  }, [theme]);

  // Close the server menu when clicking outside either menu.
  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (
        !menuRef.current?.contains(target) &&
        !floatingMenuRef.current?.contains(target)
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
    setTheme((current) =>
      current === "dark" ? "light" : "dark",
    );
  };

  const handleServerAction = (
    action: "maintenance" | ServerAction,
  ) => {
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

    setNotice(
      pendingAction === "restart"
        ? "Restart was not performed. Connect this action to the backend first."
        : "Shutdown was not performed. Connect this action to the backend first.",
    );

    setPendingAction(null);
  };

  // Shared tab navigation for the full and compact headers.
  const renderTabs = (compact = false) => (
    <nav
      aria-label={
        compact
          ? "Floating dashboard sections"
          : "Dashboard sections"
      }
      className={
        compact
          ? "min-w-0 flex-1 overflow-x-auto overscroll-x-contain"
          : "mb-6 mt-4 w-full overflow-x-auto border-b border-ctp-surface0"
      }
    >
      <div className="flex min-w-max flex-row">
        {tabs.map((tab) => (
          <TabButton
            key={tab}
            active={activeTab === tab}
            compact={compact}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </TabButton>
        ))}
      </div>
    </nav>
  );

  const menuItemClass = `flex w-full items-start gap-3 rounded px-2.5 py-2 text-left transition ${focusRing}`;

  // Shared server action controls.
  const renderServerControls = (compact = false) => (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"
          } mode`}
        aria-pressed={theme === "dark"}
        title={`Switch to ${theme === "dark" ? "light" : "dark"
          } mode`}
        className={compact ? iconButton : buttonSecondary}
      >
        {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}

        {!compact && (
          <span className="hidden sm:inline">
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </span>
        )}
      </button>

      <button
        type="button"
        aria-label="Notifications"
        title="Notifications"
        onClick={() =>
          setNotice(
            "Notifications are not connected to the backend yet.",
          )
        }
        className={iconButton}
      >
        <Bell size={16} />
      </button>

      <div
        ref={compact ? floatingMenuRef : menuRef}
        className="relative flex"
      >
        <button
          type="button"
          aria-label="Shut down server"
          onClick={() => {
            setMenuOpen(false);
            setPendingAction("shutdown");
          }}
          className={`${buttonDangerSolid} rounded-r-none ${compact ? "!px-2" : ""}`}
        >
          <Power size={15} />
          {!compact && <span>Shut down</span>}
        </button>

        <button
          type="button"
          aria-label="More server actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className={`${buttonDangerSolid} rounded-l-none border-l border-ctp-base/25 !px-2`}
        >
          <ChevronDown
            size={15}
            className={`transition-transform duration-200 ${menuOpen ? "rotate-180" : ""
              }`}
          />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-[70] mt-1.5 w-64 rounded-md border border-ctp-surface1 bg-ctp-mantle p-1 text-left shadow-lg"
          >
            <p className="px-2.5 pb-1 pt-1.5 text-xs text-ctp-subtext0">
              Server actions
            </p>

            <button
              type="button"
              role="menuitem"
              onClick={() => handleServerAction("restart")}
              className={`${menuItemClass} hover:bg-ctp-surface0`}
            >
              <RotateCcw
                size={15}
                className="mt-0.5 shrink-0 text-ctp-subtext1"
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
              onClick={() =>
                handleServerAction("maintenance")
              }
              className={`${menuItemClass} hover:bg-ctp-surface0`}
            >
              <Wrench
                size={15}
                className="mt-0.5 shrink-0 text-ctp-subtext1"
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
                  size={15}
                  className="mt-0.5 shrink-0 text-ctp-green"
                />
              )}
            </button>

            <div className="my-1 border-t border-ctp-surface0" />

            <button
              type="button"
              role="menuitem"
              onClick={() => handleServerAction("shutdown")}
              className={`${menuItemClass} hover:bg-ctp-red/10`}
            >
              <Power
                size={15}
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
  );

  const backendStatusStyles: Record<
    BackendStatus,
    { label: string; tone: "warning" | "success" | "danger" }
  > = {
    checking: { label: "Checking backend", tone: "warning" },
    connected: { label: "Backend connected", tone: "success" },
    disconnected: { label: "Backend offline", tone: "danger" },
  };

  const currentBackendStatus =
    backendStatusStyles[backendStatus];

  return (
    <div className="min-h-screen bg-ctp-base px-5 py-5 font-line-seed text-ctp-text transition-colors duration-200 sm:px-8 lg:px-10">
      {/* Compact floating navigation */}
      <div
        className={`fixed inset-x-0 top-0 z-[60] border-b border-ctp-surface0 bg-ctp-base transition-opacity duration-200 ${compactHeader
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
          }`}
        aria-hidden={!compactHeader}
      >
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-3 sm:px-8 lg:px-10">
          <button
            type="button"
            onClick={() =>
              window.scrollTo({
                top: 0,
                behavior: "smooth",
              })
            }
            tabIndex={compactHeader ? 0 : -1}
            className={`hidden shrink-0 rounded sm:block ${focusRing}`}
            title="Back to top"
          >
            <span className="block font-fredoka text-base leading-none text-ctp-text">
              Kinesis
            </span>
          </button>

          <div className="min-w-0 flex-1">
            {renderTabs(true)}
          </div>

          <div className="hidden py-1.5 sm:block">
            {renderServerControls(true)}
          </div>

          <div className="sm:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Open server actions"
              aria-expanded={menuOpen}
              tabIndex={compactHeader ? 0 : -1}
              className={iconButton}
            >
              <Power size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1500px]">
        {/* Full header */}
        <header
          ref={headerRef}
          className="flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex items-baseline gap-3">
            <p className="font-fredoka text-2xl leading-none text-ctp-text">
              Kinesis
            </p>

            <p className="text-xs text-ctp-subtext0">
              Server administration
            </p>
          </div>

          {renderServerControls(false)}
        </header>

        {/* Connection status */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <p className="flex items-center gap-1.5 text-ctp-subtext1">
            <Users size={14} className="text-ctp-subtext0" aria-hidden="true" />
            2 users connected
          </p>

          <div className="flex flex-wrap items-center gap-4">
            {maintenanceMode && (
              <StatusDot tone="warning">Maintenance preview</StatusDot>
            )}

            <span
              role="status"
              aria-live="polite"
              title={`Health endpoint: ${API_BASE_URL}/api/health`}
            >
              <StatusDot
                tone={currentBackendStatus.tone}
                pulse={backendStatus === "checking"}
              >
                {currentBackendStatus.label}
              </StatusDot>
            </span>
          </div>
        </div>

        {/* Action feedback */}
        {notice && (
          <Notice
            tone="info"
            role="status"
            className="mt-4"
            onDismiss={() => setNotice("")}
          >
            {notice}
          </Notice>
        )}

        {/* Full dashboard tabs */}
        {renderTabs(false)}

        {/* Active page */}
        <main>
          {activeTab === "Overview" && <Overview />}
          {activeTab === "Cashiers" && <Cashiers />}
          {activeTab === "Terminals" && <Terminals />}
          {activeTab === "Console" && <Console />}
          {activeTab === "Database" && <Database />}
          {activeTab === "Settings" && <Settings />}
        </main>
      </div>

      {/* Server action confirmation */}
      <Dialog
        open={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        role="alertdialog"
        labelledBy="server-action-title"
        title={
          pendingAction === "shutdown"
            ? "Shut down the server?"
            : "Restart the server?"
        }
        description={
          pendingAction === "shutdown"
            ? "Stopping the backend may disconnect all terminals and interrupt new sales until the service starts again."
            : "Restarting the backend may temporarily disconnect terminals. Pending offline sales should remain safely queued on each terminal."
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setPendingAction(null)}
              className={buttonSecondary}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={confirmServerAction}
              className={buttonDangerSolid}
            >
              {pendingAction === "shutdown"
                ? "Confirm shutdown"
                : "Confirm restart"}
            </button>
          </>
        }
      >
        <Notice tone="warning" role="note">
          Backend actions are not implemented yet. Confirming here will
          only display a notice; it will not stop or restart anything.
        </Notice>
      </Dialog>
    </div>
  );
}
