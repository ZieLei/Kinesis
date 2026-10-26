import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
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

  if (Number.isNaN(date.getTime())) return timestamp;

  return date.toLocaleTimeString("en-PH", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const buttonBase =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 font-line-seed text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ctp-mauve";

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
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    mountedRef.current = true;
    manualCloseRef.current = false;

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

    function connect() {
      if (!mountedRef.current || manualCloseRef.current) return;

      setConnection("connecting");

      const protocol =
        window.location.protocol === "https:" ? "wss:" : "ws:";
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
        appendLog(
          "WARN",
          "Console connection closed. Attempting to reconnect...",
        );
        scheduleReconnect();
      };

      socket.onerror = () => {
        if (!mountedRef.current) return;
        setConnection("disconnected");
      };
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
      setInputError("Not connected. Wait for the console to reconnect.");
      return;
    }

    // The backend must validate and authorize commands before execution.
    socket.send(
      JSON.stringify({
        type: "command",
        command: trimmed,
      }),
    );

    appendLog("COMMAND", trimmed);
    setCommandHistory((current) =>
      [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 100),
    );
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
      return;
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

  function downloadLogs() {
    const content = [
      "Timestamp\tLevel\tMessage",
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

  const connectionStyle =
    connection === "connected"
      ? "border-ctp-green/25 bg-ctp-green/10 text-ctp-green"
      : connection === "connecting"
        ? "border-ctp-yellow/25 bg-ctp-yellow/10 text-ctp-yellow"
        : "border-ctp-red/25 bg-ctp-red/10 text-ctp-red";

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[500px] flex-col gap-3">
      {/* Compact page header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ctp-mauve/20 bg-ctp-mauve/10">
            <TerminalIcon size={20} className="text-ctp-mauve" />
          </div>

          <div className="min-w-0">
            <h1 className="font-line-seed text-xl font-bold text-ctp-text">
              Server Console
            </h1>
            <p className="font-line-seed text-xs text-ctp-subtext0">
              Monitor output and send server commands.
            </p>
          </div>
        </div>

        <div
          className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 ${connectionStyle}`}
          role="status"
          aria-live="polite"
        >
          {connection === "connected" ? (
            <Wifi size={14} />
          ) : connection === "connecting" ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <WifiOff size={14} />
          )}

          <span className="font-line-seed text-xs font-semibold">
            {connection === "connected"
              ? "Connected"
              : connection === "connecting"
                ? "Connecting"
                : "Disconnected"}
          </span>
        </div>
      </header>

      {/* Compact stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-ctp-surface0 bg-ctp-base px-3 py-2">
          <span className="font-line-seed text-xs text-ctp-subtext0">
            Logs
          </span>
          <span className="font-mono text-sm font-bold tabular-nums text-ctp-text">
            {logs.length}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg border border-ctp-surface0 bg-ctp-base px-3 py-2">
          <span className="font-line-seed text-xs text-ctp-subtext0">
            Errors
          </span>
          <span className="font-mono text-sm font-bold tabular-nums text-ctp-red">
            {errorCount}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg border border-ctp-surface0 bg-ctp-base px-3 py-2">
          <span className="font-line-seed text-xs text-ctp-subtext0">
            Warnings
          </span>
          <span className="font-mono text-sm font-bold tabular-nums text-ctp-yellow">
            {warningCount}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setAutoScroll((current) => !current)}
          aria-pressed={autoScroll}
          className="flex items-center justify-between gap-2 rounded-lg border border-ctp-surface0 bg-ctp-base px-3 py-2 text-left transition-colors hover:border-ctp-surface1"
        >
          <span className="font-line-seed text-xs text-ctp-subtext0">
            Auto-scroll
          </span>
          <span
            className={`font-line-seed text-xs font-semibold ${autoScroll ? "text-ctp-green" : "text-ctp-subtext0"
              }`}
          >
            {autoScroll ? "On" : "Paused"}
          </span>
        </button>
      </div>

      {/* Terminal */}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-ctp-surface0 bg-ctp-crust shadow-[0_4px_16px_rgba(0,0,0,0.10)]">
        {/* Toolbar */}
        <div className="shrink-0 border-b border-ctp-surface0 bg-ctp-mantle p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div
                className="flex shrink-0 items-center gap-1.5"
                aria-hidden="true"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-ctp-red" />
                <span className="h-2.5 w-2.5 rounded-full bg-ctp-yellow" />
                <span className="h-2.5 w-2.5 rounded-full bg-ctp-green" />
              </div>

              <span className="truncate font-mono text-xs text-ctp-subtext0">
                kinesis-server / console
              </span>

              <span className="hidden rounded border border-ctp-surface0 px-1.5 py-0.5 font-mono text-[10px] text-ctp-overlay1 sm:inline">
                {filteredLogs.length} shown
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowTimestamps((current) => !current)}
                aria-pressed={showTimestamps}
                className={`${buttonBase} ${showTimestamps
                    ? "border-ctp-mauve/30 bg-ctp-mauve/10 text-ctp-mauve"
                    : "border-ctp-surface1 text-ctp-subtext0 hover:text-ctp-text"
                  }`}
              >
                <Clock size={13} />
                Time
              </button>

              <button
                type="button"
                onClick={() => setAutoScroll((current) => !current)}
                aria-pressed={autoScroll}
                className={`${buttonBase} border-ctp-surface1 text-ctp-subtext0 hover:border-ctp-blue/40 hover:text-ctp-blue`}
              >
                {autoScroll ? <Pause size={13} /> : <Play size={13} />}
                {autoScroll ? "Pause" : "Resume"}
              </button>

              <button
                type="button"
                onClick={() => setLogs([])}
                disabled={logs.length === 0}
                className={`${buttonBase} border-ctp-surface1 text-ctp-subtext0 hover:border-ctp-red/40 hover:text-ctp-red disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <Eraser size={13} />
                Clear
              </button>

              <button
                type="button"
                onClick={downloadLogs}
                disabled={logs.length === 0}
                className={`${buttonBase} border-ctp-surface1 text-ctp-subtext0 hover:border-ctp-green/40 hover:text-ctp-green disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <Download size={13} />
                Export
              </button>
            </div>
          </div>

          {/* Search and level filter */}
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-ctp-surface0 bg-ctp-crust px-2.5 focus-within:border-ctp-mauve/60">
              <Activity size={14} className="shrink-0 text-ctp-overlay1" />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search messages..."
                aria-label="Search console messages"
                className="min-w-0 flex-1 bg-transparent py-2 font-mono text-xs text-ctp-text outline-none placeholder:text-ctp-overlay1"
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="shrink-0 text-ctp-overlay1 hover:text-ctp-text"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filter log level"
              className="rounded-md border border-ctp-surface0 bg-ctp-crust px-3 py-2 font-line-seed text-xs text-ctp-subtext1 outline-none focus:border-ctp-mauve sm:w-36"
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

        {/* Output */}
        <div
          ref={logContainerRef}
          className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-xs leading-5 sm:px-4 sm:py-3 sm:text-[13px] sm:leading-6"
          role="log"
          aria-label="Server console output"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex min-h-full flex-col items-center justify-center px-4 py-10 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-ctp-surface0 bg-ctp-mantle">
                <TerminalIcon size={21} className="text-ctp-overlay1" />
              </div>

              <p className="font-line-seed text-sm font-semibold text-ctp-subtext1">
                {logs.length === 0
                  ? connection === "connected"
                    ? "Waiting for server output"
                    : "No console output yet"
                  : "No matching entries"}
              </p>

              <p className="mt-1 max-w-sm font-line-seed text-xs leading-relaxed text-ctp-overlay1">
                {logs.length === 0
                  ? connection === "connected"
                    ? "The connection is ready. Output will appear when the server sends log events."
                    : "The console will show output after the WebSocket connection is established."
                  : "Change the search or log level to see more entries."}
              </p>

              {connection === "disconnected" && logs.length === 0 && (
                <p className="mt-3 rounded-md border border-ctp-yellow/20 bg-ctp-yellow/5 px-2.5 py-1.5 font-line-seed text-xs text-ctp-yellow">
                  Check that FastAPI exposes {WS_PATH}.
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
                    className="group flex min-w-0 items-start gap-2 rounded px-1 py-0.5 hover:bg-ctp-surface0/40"
                  >
                    {showTimestamps && (
                      <span className="shrink-0 select-none text-ctp-overlay1">
                        {formatTime(log.timestamp)}
                      </span>
                    )}

                    <span
                      className={`flex w-[74px] shrink-0 items-center gap-1 font-bold ${levelStyles[log.level]}`}
                    >
                      <Icon size={12} className="shrink-0" />
                      {log.level}
                    </span>

                    <span
                      className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${log.level === "ERROR"
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
        <div className="shrink-0 border-t border-ctp-surface0 bg-ctp-mantle p-2.5 sm:p-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              sendCommand();
            }}
          >
            <div
              className={`flex items-center gap-2 rounded-lg border bg-ctp-crust px-3 py-2 transition-colors focus-within:border-ctp-mauve ${inputError ? "border-ctp-red/50" : "border-ctp-surface0"
                }`}
            >
              <span
                className="select-none font-mono text-sm font-bold text-ctp-green"
                aria-hidden="true"
              >
                $
              </span>

              <input
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
                    : "Waiting for connection..."
                }
                className="min-w-0 flex-1 bg-transparent py-1 font-mono text-sm text-ctp-text outline-none placeholder:text-ctp-overlay1 disabled:cursor-not-allowed"
              />

              <button
                type="submit"
                disabled={connection !== "connected" || !command.trim()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-ctp-mauve px-3 py-2 font-line-seed text-xs font-bold text-ctp-base transition-colors hover:bg-ctp-mauve/80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={13} />
                <span className="hidden sm:inline">Execute</span>
              </button>
            </div>

            {inputError && (
              <p className="mt-1.5 font-line-seed text-xs text-ctp-red" role="alert">
                {inputError}
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <p className="font-line-seed text-[11px] text-ctp-overlay1">
                Enter to execute · ↑ / ↓ for history
              </p>

              <p
                className={`font-line-seed text-[11px] ${connection === "connected"
                    ? "text-ctp-green"
                    : "text-ctp-overlay1"
                  }`}
              >
                {connection === "connected"
                  ? "WebSocket ready"
                  : "Commands disabled while disconnected"}
              </p>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
