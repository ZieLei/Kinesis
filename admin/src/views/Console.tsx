import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  CheckCircle2,
  CircleAlert,
  Clock,
  Download,
  Eraser,
  Pause,
  Play,
  RefreshCw,
  Send,
  Terminal as TerminalIcon,
  Wifi,
  WifiOff,
  XCircle,
  X,
} from "lucide-react";

type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR" | "DEBUG" | "COMMAND";

type ConsoleLog = {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
};

type ServerMessage =
  | { type: "log"; log: Omit<ConsoleLog, "id"> }
  | { type: "result"; command: string; output: string }
  | { type: "error"; message: string }
  | { type: "status"; message: string };

const MAX_LOGS = 2000;
const WS_PATH = "/api/console/ws";

const levelStyles: Record<LogLevel, string> = {
  INFO: "text-ctp-blue",
  SUCCESS: "text-ctp-green",
  WARN: "text-ctp-yellow",
  ERROR: "text-ctp-red",
  DEBUG: "text-ctp-overlay1",
  COMMAND: "text-ctp-mauve",
};

const levelIcons: Record<LogLevel, typeof Activity> = {
  INFO: Activity,
  SUCCESS: CheckCircle2,
  WARN: CircleAlert,
  ERROR: XCircle,
  DEBUG: Clock,
  COMMAND: TerminalIcon,
};

function createLog(level: LogLevel, message: string): ConsoleLog {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    level,
    message,
  };
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleTimeString("en-PH", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function Console() {
  const [logs, setLogs] = useState<ConsoleLog[]>([]);
  const [command, setCommand] = useState("");
  const [connection, setConnection] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [inputError, setInputError] = useState("");

  const socketRef = useRef<WebSocket | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const mountedRef = useRef(true);
  const reconnectAttemptsRef = useRef(0);
  const manualCloseRef = useRef(false);

  const appendLog = useCallback(
    (level: LogLevel, message: string, timestamp?: string) => {
      setLogs((current) => {
        const next = [
          ...current,
          {
            ...createLog(level, message),
            ...(timestamp ? { timestamp } : {}),
          },
        ];

        return next.slice(-MAX_LOGS);
      });
    },
    [],
  );

  // Connect to the FastAPI console WebSocket.
  useEffect(() => {
    mountedRef.current = true;
    manualCloseRef.current = false;

    function connect() {
      if (!mountedRef.current || manualCloseRef.current) return;

      setConnection("connecting");

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socketUrl = `${protocol}//${window.location.host}${WS_PATH}`;

      let socket: WebSocket;

      try {
        socket = new WebSocket(socketUrl);
        socketRef.current = socket;
      } catch {
        setConnection("disconnected");
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        if (!mountedRef.current) return;

        reconnectAttemptsRef.current = 0;
        setConnection("connected");
        appendLog("SUCCESS", "Connected to the server console.");
      };

      socket.onmessage = (event: MessageEvent) => {
        if (!mountedRef.current) return;

        try {
          const data = JSON.parse(event.data) as ServerMessage;

          if (data.type === "log") {
            const { level, message, timestamp } = data.log;

            const validLevels: LogLevel[] = [
              "INFO",
              "SUCCESS",
              "WARN",
              "ERROR",
              "DEBUG",
              "COMMAND",
            ];

            appendLog(
              validLevels.includes(level) ? level : "INFO",
              String(message),
              timestamp,
            );
          } else if (data.type === "result") {
            appendLog("INFO", data.output);
          } else if (data.type === "error") {
            appendLog("ERROR", data.message);
          } else if (data.type === "status") {
            appendLog("INFO", data.message);
          }
        } catch {
          appendLog("WARN", "Received an invalid console message.");
        }
      };

      socket.onclose = () => {
        if (!mountedRef.current || manualCloseRef.current) return;

        setConnection("disconnected");
        appendLog("WARN", "Console connection closed. Attempting to reconnect...");
        scheduleReconnect();
      };

      socket.onerror = () => {
        if (!mountedRef.current) return;
        setConnection("disconnected");
      };
    }

    function scheduleReconnect() {
      if (!mountedRef.current || manualCloseRef.current) return;
      if (reconnectTimerRef.current) return;

      const attempt = reconnectAttemptsRef.current++;
      const delay = Math.min(1000 * 2 ** attempt, 15000);

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay);
    }

    connect();

    return () => {
      mountedRef.current = false;
      manualCloseRef.current = true;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [appendLog]);

  // Keep the terminal pinned to the latest output unless paused.
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop =
        logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const sendCommand = useCallback(() => {
    const trimmed = command.trim();

    if (!trimmed) return;

    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setInputError("Not connected to the server console.");
      return;
    }

    // The backend must validate and authorize commands before executing them.
    socket.send(
      JSON.stringify({
        type: "command",
        command: trimmed,
      }),
    );

    appendLog("COMMAND", trimmed);
    setCommandHistory((current) => [
      trimmed,
      ...current.filter((item) => item !== trimmed),
    ].slice(0, 100));
    setHistoryIndex(-1);
    setCommand("");
    setInputError("");
  }, [command, appendLog]);

  function handleCommandKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Enter") {
      event.preventDefault();
      sendCommand();
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();

      const nextIndex = Math.min(
        historyIndex + 1,
        commandHistory.length - 1,
      );

      if (nextIndex >= 0) {
        setHistoryIndex(nextIndex);
        setCommand(commandHistory[nextIndex]);
      }
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();

      const nextIndex = historyIndex - 1;

      if (nextIndex < 0) {
        setHistoryIndex(-1);
        setCommand("");
      } else {
        setHistoryIndex(nextIndex);
        setCommand(commandHistory[nextIndex]);
      }
    }
  }

  function clearLogs() {
    setLogs([]);
  }

  function downloadLogs() {
    const header = "Timestamp\tLevel\tMessage";

    const content = [
      header,
      ...logs.map((log) =>
        [
          log.timestamp,
          log.level,
          log.message.replace(/\r?\n/g, "\\n"),
        ].join("\t"),
      ),
    ].join("\n");

    const blob = new Blob([content], {
      type: "text/plain;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `kinesis-console-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.log`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const filteredLogs = logs.filter((log) => {
    const matchesLevel = filter === "ALL" || log.level === filter;
    const matchesSearch = `${log.message} ${log.level}`
      .toLowerCase()
      .includes(search.toLowerCase());

    return matchesLevel && matchesSearch;
  });

  const errorCount = logs.filter((log) => log.level === "ERROR").length;
  const warningCount = logs.filter((log) => log.level === "WARN").length;

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[500px] flex-col gap-4">
      {/* Page header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <TerminalIcon size={24} className="text-ctp-mauve" />
            <h1 className="font-inter text-2xl font-bold text-ctp-text">
              Server Console
            </h1>
          </div>
          <p className="mt-1 font-inter text-sm text-ctp-subtext0">
            Live server output and administrative commands.
          </p>
        </div>

        <div
          className={`flex items-center gap-2 self-start rounded-lg border px-3 py-2 ${connection === "connected"
            ? "border-ctp-green/20 bg-ctp-green/10 text-ctp-green"
            : connection === "connecting"
              ? "border-ctp-yellow/20 bg-ctp-yellow/10 text-ctp-yellow"
              : "border-ctp-red/20 bg-ctp-red/10 text-ctp-red"
            }`}
        >
          {connection === "connected" ? (
            <Wifi size={16} />
          ) : connection === "connecting" ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <WifiOff size={16} />
          )}
          <span className="font-inter text-sm font-semibold">
            {connection === "connected"
              ? "Connected"
              : connection === "connecting"
                ? "Connecting..."
                : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Console stats */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
          <p className="font-inter text-xs font-medium text-ctp-subtext0">
            Displayed Logs
          </p>
          <p className="mt-1 font-inter text-xl font-bold text-ctp-text">
            {logs.length}
          </p>
        </div>

        <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
          <p className="font-inter text-xs font-medium text-ctp-subtext0">
            Errors
          </p>
          <p className="mt-1 font-inter text-xl font-bold text-ctp-red">
            {errorCount}
          </p>
        </div>

        <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
          <p className="font-inter text-xs font-medium text-ctp-subtext0">
            Warnings
          </p>
          <p className="mt-1 font-inter text-xl font-bold text-ctp-yellow">
            {warningCount}
          </p>
        </div>

        <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
          <p className="font-inter text-xs font-medium text-ctp-subtext0">
            Auto-scroll
          </p>
          <p
            className={`mt-1 font-inter text-xl font-bold ${autoScroll ? "text-ctp-green" : "text-ctp-subtext0"
              }`}
          >
            {autoScroll ? "Enabled" : "Paused"}
          </p>
        </div>
      </div>

      {/* Terminal window */}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-ctp-surface0 bg-ctp-crust shadow-[0_4px_16px_rgba(0,0,0,0.12)]">
        {/* Terminal toolbar */}
        <div className="flex flex-col gap-3 border-b border-ctp-surface0 bg-ctp-mantle px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-ctp-red" />
              <span className="h-3 w-3 rounded-full bg-ctp-yellow" />
              <span className="h-3 w-3 rounded-full bg-ctp-green" />
              <span className="ml-2 font-mono text-xs text-ctp-subtext0">
                kinesis-server — console
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowTimestamps((current) => !current)}
                className={`rounded-md border px-2.5 py-1.5 font-inter text-xs font-medium transition-colors ${showTimestamps
                  ? "border-ctp-mauve/30 bg-ctp-mauve/10 text-ctp-mauve"
                  : "border-ctp-surface1 text-ctp-subtext0 hover:text-ctp-text"
                  }`}
              >
                <Clock size={13} className="mr-1.5 inline" />
                Timestamps
              </button>

              <button
                type="button"
                onClick={() => setAutoScroll((current) => !current)}
                className="rounded-md border border-ctp-surface1 px-2.5 py-1.5 font-inter text-xs font-medium text-ctp-subtext1 transition-colors hover:border-ctp-blue/40 hover:text-ctp-blue"
              >
                {autoScroll ? (
                  <Pause size={13} className="mr-1.5 inline" />
                ) : (
                  <Play size={13} className="mr-1.5 inline" />
                )}
                {autoScroll ? "Pause scroll" : "Resume scroll"}
              </button>

              <button
                type="button"
                onClick={clearLogs}
                className="rounded-md border border-ctp-surface1 px-2.5 py-1.5 font-inter text-xs font-medium text-ctp-subtext1 transition-colors hover:border-ctp-red/40 hover:text-ctp-red"
              >
                <Eraser size={13} className="mr-1.5 inline" />
                Clear
              </button>

              <button
                type="button"
                onClick={downloadLogs}
                disabled={logs.length === 0}
                className="rounded-md border border-ctp-surface1 px-2.5 py-1.5 font-inter text-xs font-medium text-ctp-subtext1 transition-colors hover:border-ctp-green/40 hover:text-ctp-green disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download size={13} className="mr-1.5 inline" />
                Download
              </button>
            </div>
          </div>

          {/* Log filters */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-ctp-surface0 bg-ctp-crust px-3">
              <Activity size={14} className="shrink-0 text-ctp-overlay1" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search console output..."
                className="min-w-0 flex-1 bg-transparent py-2 font-mono text-xs text-ctp-text outline-none placeholder:text-ctp-overlay1"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="text-ctp-overlay1 hover:text-ctp-text"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="rounded-md border border-ctp-surface0 bg-ctp-crust px-3 py-2 font-inter text-xs text-ctp-subtext1 outline-none focus:border-ctp-mauve"
            >
              <option value="ALL">All levels</option>
              <option value="INFO">Info</option>
              <option value="SUCCESS">Success</option>
              <option value="WARN">Warning</option>
              <option value="ERROR">Error</option>
              <option value="DEBUG">Debug</option>
              <option value="COMMAND">Commands</option>
            </select>
          </div>
        </div>

        {/* Log output */}
        <div
          ref={logContainerRef}
          className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-xs leading-6 sm:text-sm"
          role="log"
          aria-label="Server console output"
          aria-live="polite"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex min-h-full flex-col items-center justify-center py-12 text-center">
              <TerminalIcon size={32} className="mb-3 text-ctp-surface1" />
              <p className="font-inter text-sm font-semibold text-ctp-subtext1">
                {logs.length === 0
                  ? "Waiting for server output"
                  : "No matching log entries"}
              </p>
              <p className="mt-1 max-w-sm font-inter text-xs text-ctp-overlay1">
                {logs.length === 0
                  ? "Console output will appear here when the WebSocket connection is established and the backend sends log events."
                  : "Try another search term or change the selected log level."}
              </p>
              {connection === "disconnected" && logs.length === 0 && (
                <p className="mt-3 font-inter text-xs text-ctp-yellow">
                  Check that the FastAPI server exposes {WS_PATH}.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              {filteredLogs.map((log) => {
                const Icon = levelIcons[log.level];

                return (
                  <div
                    key={log.id}
                    className="group flex items-start gap-2 rounded px-1 hover:bg-ctp-surface0/40"
                  >
                    {showTimestamps && (
                      <span className="shrink-0 select-none text-ctp-overlay1">
                        {formatTime(log.timestamp)}
                      </span>
                    )}

                    <span
                      className={`flex w-[76px] shrink-0 items-center gap-1 font-bold ${levelStyles[log.level]}`}
                    >
                      <Icon size={13} />
                      {log.level}
                    </span>

                    <span
                      className={`min-w-0 whitespace-pre-wrap break-words ${log.level === "ERROR"
                        ? "text-ctp-red"
                        : log.level === "WARN"
                          ? "text-ctp-yellow"
                          : log.level === "COMMAND"
                            ? "text-ctp-mauve"
                            : "text-ctp-text"
                        }`}
                    >
                      {log.message}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Command input */}
        <div className="border-t border-ctp-surface0 bg-ctp-mantle p-3 sm:p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              sendCommand();
            }}
          >
            <div
              className={`flex items-center gap-3 rounded-lg border bg-ctp-crust px-3 py-3 transition-colors focus-within:border-ctp-mauve ${inputError
                ? "border-ctp-red/50"
                : "border-ctp-surface0"
                }`}
            >
              <span className="select-none font-mono text-sm font-bold text-ctp-green">
                $
              </span>

              <input
                ref={inputRef}
                value={command}
                onChange={(event) => {
                  setCommand(event.target.value);
                  setInputError("");
                }}
                onKeyDown={handleCommandKeyDown}
                disabled={connection !== "connected"}
                autoComplete="off"
                spellCheck={false}
                aria-label="Enter server command"
                placeholder={
                  connection === "connected"
                    ? "Enter an authorized server command..."
                    : "Waiting for server connection..."
                }
                className="min-w-0 flex-1 bg-transparent font-mono text-sm text-ctp-text outline-none placeholder:text-ctp-overlay1 disabled:cursor-not-allowed"
              />

              <button
                type="submit"
                disabled={connection !== "connected" || !command.trim()}
                className="inline-flex shrink-0 items-center gap-2 rounded-md bg-ctp-mauve px-3 py-2 font-inter text-xs font-bold text-ctp-base transition-colors hover:bg-ctp-mauve/80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={14} />
                <span className="hidden sm:inline">Execute</span>
              </button>
            </div>

            {inputError && (
              <p className="mt-2 font-inter text-xs text-ctp-red">
                {inputError}
              </p>
            )}

            <div className="mt-2 flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
              <p className="font-inter text-xs text-ctp-overlay1">
                Enter to execute · ↑ / ↓ to browse command history
              </p>
              <p className="font-inter text-xs text-ctp-overlay1">
                {connection === "connected"
                  ? "WebSocket ready"
                  : "Commands unavailable while disconnected"}
              </p>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
