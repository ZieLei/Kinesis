
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import {
  Download,
  Eraser,
  Pause,
  Play,
  RefreshCw,
  Send,
} from "lucide-react";

import Section from "../components/ui/Section";
import PageHeader from "../components/ui/PageHeader";
import Notice from "../components/ui/Notice";
import SearchInput from "../components/ui/SearchInput";
import StatusDot, { type StatusTone } from "../components/ui/StatusDot";
import {
  buttonPrimary,
  buttonSecondary,
  buttonSmall,
  focusRing,
} from "../components/ui/styles";

import { API_BASE_URL } from "../lib/api";


type LogLevel =
  | "INFO"
  | "SUCCESS"
  | "WARN"
  | "ERROR"
  | "DEBUG"
  | "COMMAND";

type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

type LogFilter =
  | "ALL"
  | LogLevel;


type ConsoleLog = {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
};


type ServerMessage =
  | {
    type: "log";
    log: {
      level?: string;
      timestamp?: string;
      message?: string;
    };
  }
  | {
    type: "result";
    command?: string;
    output?: string;
  }
  | {
    type: "error";
    message?: string;
  }
  | {
    type: "status";
    message?: string;
  };


const MAX_LOG_ENTRIES = 2000;


const LOG_FILTERS: LogFilter[] = [
  "ALL",
  "INFO",
  "SUCCESS",
  "WARN",
  "ERROR",
  "DEBUG",
  "COMMAND",
];


const COMMAND_EXAMPLES = [
  {
    command: "help",
    description: "List supported commands",
  },
  {
    command: "status",
    description: "Check API status",
  },
  {
    command: "db check",
    description: "Check database connectivity",
  },
  {
    command: "inventory summary",
    description: "Summarize inventory",
  },
  {
    command: "terminals list",
    description: "List registered terminals",
  },
  {
    command: "sales today",
    description: "Summarize today's sales",
  },
];


// --------------------------------------------------
// Formatting helpers
// --------------------------------------------------


function normalizeLevel(
  value?: string,
): LogLevel {
  const level = value?.toUpperCase();

  if (
    level === "INFO" ||
    level === "SUCCESS" ||
    level === "WARN" ||
    level === "ERROR" ||
    level === "DEBUG" ||
    level === "COMMAND"
  ) {
    return level;
  }

  return "INFO";
}


function formatTimestamp(
  timestamp: string,
): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleTimeString(
    "en-PH",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    },
  );
}


function getWebSocketUrl(): string {
  const url = new URL(
    "/api/console/ws",
    API_BASE_URL,
  );

  url.protocol =
    url.protocol === "https:"
      ? "wss:"
      : "ws:";

  url.search = "";
  url.hash = "";

  return url.toString();
}


// --------------------------------------------------
// Log styling
// --------------------------------------------------


// Rendered inside a `.dark` container, so ctp tokens resolve to Mocha.
function getLevelStyle(
  level: LogLevel,
): string {
  switch (level) {
    case "SUCCESS":
      return "text-ctp-green";

    case "WARN":
      return "text-ctp-yellow";

    case "ERROR":
      return "text-ctp-red";

    case "DEBUG":
      return "text-ctp-overlay2";

    case "COMMAND":
      return "text-ctp-blue";

    case "INFO":
    default:
      return "text-ctp-text";
  }
}


function formatFilterLabel(level: LogFilter): string {
  return level === "ALL"
    ? "All"
    : level.charAt(0) + level.slice(1).toLowerCase();
}


// --------------------------------------------------
// Operational Console
// --------------------------------------------------


export default function Console() {
  const [connection, setConnection] =
    useState<ConnectionState>("disconnected");

  const [logs, setLogs] =
    useState<ConsoleLog[]>([]);

  const [command, setCommand] =
    useState("");

  const [commandHistory, setCommandHistory] =
    useState<string[]>([]);

  const [historyIndex, setHistoryIndex] =
    useState(-1);

  const [filter, setFilter] =
    useState<LogFilter>("ALL");

  const [search, setSearch] =
    useState("");

  const [paused, setPaused] =
    useState(false);

  const [showCommands, setShowCommands] =
    useState(false);


  const socketRef =
    useRef<WebSocket | null>(null);

  const generationRef = useRef(0);

  const authenticatedRef = useRef(false);

  const pausedRef = useRef(paused);

  const logContainerRef =
    useRef<HTMLDivElement | null>(null);

  const commandInputRef =
    useRef<HTMLInputElement | null>(null);


  // --------------------------------------------------
  // Keep pause state synchronized
  // --------------------------------------------------

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);


  // --------------------------------------------------
  // Append log
  // --------------------------------------------------

  const appendLog = useCallback(
    (
      level: LogLevel,
      message: string,
      timestamp?: string,
    ) => {
      const entry: ConsoleLog = {
        id: (
          `${Date.now()}-` +
          `${Math.random().toString(36).slice(2, 9)}`
        ),
        timestamp:
          timestamp || new Date().toISOString(),
        level,
        message,
      };

      setLogs((current) =>
        [...current, entry].slice(-MAX_LOG_ENTRIES),
      );
    },
    [],
  );


  // --------------------------------------------------
  // WebSocket connection
  // --------------------------------------------------

  const connect = useCallback(() => {
    generationRef.current += 1;

    const generation = generationRef.current;

    authenticatedRef.current = false;


    // Close previous connection.
    const previousSocket = socketRef.current;

    if (previousSocket) {
      previousSocket.onclose = null;
      previousSocket.onerror = null;
      previousSocket.onmessage = null;
      previousSocket.onopen = null;

      if (
        previousSocket.readyState === WebSocket.CONNECTING ||
        previousSocket.readyState === WebSocket.OPEN
      ) {
        previousSocket.close();
      }
    }


    socketRef.current = null;

    setConnection("connecting");


    let socket: WebSocket;

    try {
      socket = new WebSocket(
        getWebSocketUrl(),
      );
    } catch (error) {
      setConnection("error");

      appendLog(
        "ERROR",
        error instanceof Error
          ? `Could not create WebSocket: ${error.message}`
          : "Could not create the WebSocket connection.",
      );

      return;
    }


    socketRef.current = socket;

    appendLog(
      "INFO",
      "Connecting to the Kinesis backend console...",
    );


    socket.onopen = () => {
      if (generation !== generationRef.current) {
        socket.close();
        return;
      }

      // The browser automatically includes the HttpOnly session cookie.
      // The server authenticates the WebSocket handshake itself.
      appendLog(
        "INFO",
        "Connection opened. Waiting for server authentication...",
      );
    };


    socket.onmessage = (
      event: MessageEvent<string>,
    ) => {
      if (generation !== generationRef.current) {
        return;
      }

      let data: ServerMessage;

      try {
        data = JSON.parse(
          event.data,
        ) as ServerMessage;
      } catch {
        appendLog(
          "WARN",
          "Received an unreadable message from the server.",
        );

        return;
      }


      switch (data.type) {
        case "log": {
          if (pausedRef.current) {
            return;
          }

          appendLog(
            normalizeLevel(data.log?.level),
            data.log?.message || "",
            data.log?.timestamp,
          );

          break;
        }


        case "result": {
          const output =
            data.output?.trim() || "(No output)";

          appendLog(
            "SUCCESS",
            (
              `${data.command ? `$ ${data.command}\n` : ""}` +
              output
            ),
          );

          break;
        }


        case "error": {
          appendLog(
            "ERROR",
            data.message || "The server reported an error.",
          );

          if (!authenticatedRef.current) {
            setConnection("error");
          }

          break;
        }


        case "status": {
          authenticatedRef.current = true;

          setConnection("connected");

          appendLog(
            "SUCCESS",
            data.message ||
            "Authenticated with the Kinesis backend.",
          );

          break;
        }


        default: {
          appendLog(
            "DEBUG",
            "Received an unrecognized server message.",
          );
        }
      }
    };


    socket.onerror = () => {
      if (generation === generationRef.current) {
        setConnection("error");
      }
    };


    socket.onclose = (event) => {
      if (generation !== generationRef.current) {
        return;
      }

      socketRef.current = null;

      const wasAuthenticated =
        authenticatedRef.current;

      authenticatedRef.current = false;

      setConnection(
        wasAuthenticated
          ? "disconnected"
          : "error",
      );


      appendLog(
        wasAuthenticated ? "WARN" : "ERROR",
        wasAuthenticated
          ? "The console connection closed. Reconnect to continue."
          : (
            `The console connection closed before authentication completed. ` +
            `WebSocket close code: ${event.code}.`
          ),
      );
    };
  }, [appendLog]);


  // --------------------------------------------------
  // Connect on mount
  // --------------------------------------------------

  useEffect(() => {
    connect();

    return () => {
      generationRef.current += 1;

      authenticatedRef.current = false;

      const socket = socketRef.current;

      socketRef.current = null;

      if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.onopen = null;

        if (
          socket.readyState === WebSocket.CONNECTING ||
          socket.readyState === WebSocket.OPEN
        ) {
          socket.close();
        }
      }
    };
  }, [connect]);


  // --------------------------------------------------
  // Filter logs
  // --------------------------------------------------

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();

    return logs.filter((entry) => {
      const matchesLevel =
        filter === "ALL" ||
        entry.level === filter;

      const matchesSearch =
        !query ||
        entry.message.toLowerCase().includes(query) ||
        entry.level.toLowerCase().includes(query);

      return matchesLevel && matchesSearch;
    });
  }, [filter, logs, search]);


  // --------------------------------------------------
  // Scroll only the console output panel
  // --------------------------------------------------

  useEffect(() => {
    if (paused) {
      return;
    }

    const container = logContainerRef.current;

    if (container) {
      container.scrollTop =
        container.scrollHeight;
    }
  }, [filteredLogs, paused]);


  // --------------------------------------------------
  // Diagnostic command submission
  // --------------------------------------------------

  const handleCommandSubmit = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const trimmedCommand = command.trim();

    if (!trimmedCommand) {
      return;
    }

    const socket = socketRef.current;

    if (
      connection !== "connected" ||
      !socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      appendLog(
        "WARN",
        "The console is not connected. Reconnect before running a command.",
      );

      return;
    }


    try {
      socket.send(
        JSON.stringify({
          type: "command",
          command: trimmedCommand,
        }),
      );

      appendLog(
        "COMMAND",
        `$ ${trimmedCommand}`,
      );

      setCommandHistory((current) =>
        [
          ...current.filter(
            (item) => item !== trimmedCommand,
          ),
          trimmedCommand,
        ].slice(-100),
      );

      setHistoryIndex(-1);
      setCommand("");
    } catch {
      appendLog(
        "ERROR",
        "Could not send the command to the backend.",
      );
    }

    commandInputRef.current?.focus();
  };


  // --------------------------------------------------
  // Command history navigation
  // --------------------------------------------------

  const handleCommandKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();

      if (commandHistory.length === 0) {
        return;
      }

      const nextIndex =
        historyIndex < 0
          ? commandHistory.length - 1
          : Math.max(0, historyIndex - 1);

      setHistoryIndex(nextIndex);

      setCommand(
        commandHistory[nextIndex],
      );
    }


    if (event.key === "ArrowDown") {
      event.preventDefault();

      if (historyIndex < 0) {
        return;
      }

      const nextIndex = historyIndex + 1;

      if (nextIndex >= commandHistory.length) {
        setHistoryIndex(-1);
        setCommand("");
      } else {
        setHistoryIndex(nextIndex);

        setCommand(
          commandHistory[nextIndex],
        );
      }
    }
  };


  // --------------------------------------------------
  // Clear logs
  // --------------------------------------------------

  const clearLogs = () => {
    setLogs([]);
  };


  // --------------------------------------------------
  // Export logs
  // --------------------------------------------------

  const exportLogs = () => {
    const content = logs
      .map(
        (entry) =>
        (
          `[${formatTimestamp(entry.timestamp)}] ` +
          `[${entry.level}] ${entry.message}`
        ),
      )
      .join("\n");

    const blob = new Blob(
      [content],
      {
        type: "text/plain;charset=utf-8",
      },
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.download = (
      `kinesis-console-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.log`
    );

    document.body.appendChild(link);

    link.click();

    link.remove();

    URL.revokeObjectURL(url);
  };


  // --------------------------------------------------
  // Connection status styling
  // --------------------------------------------------

  const statusConfig: Record<
    ConnectionState,
    { label: string; tone: StatusTone }
  > = {
    connecting: { label: "Connecting", tone: "warning" },
    connected: { label: "Connected", tone: "success" },
    disconnected: { label: "Disconnected", tone: "neutral" },
    error: { label: "Connection error", tone: "danger" },
  };


  // --------------------------------------------------
  // Render
  // --------------------------------------------------

  return (
    <div className="w-full min-w-0 space-y-8 font-line-seed">
      <PageHeader
        title="Operational console"
        description="Inspect backend health, inventory, sales, and registered terminals through approved diagnostic commands."
        status={
          <StatusDot
            tone={statusConfig[connection].tone}
            pulse={connection === "connecting"}
          >
            {statusConfig[connection].label}
          </StatusDot>
        }
      />


      {/* Connection information */}
      <Notice
        role="status"
        tone={
          connection === "connected"
            ? "success"
            : connection === "connecting"
              ? "warning"
              : "danger"
        }
        title={
          connection === "connected"
            ? "Authenticated with the backend"
            : connection === "connecting"
              ? "Establishing secure console session"
              : "Console session is not active"
        }
        action={
          <button
            type="button"
            onClick={connect}
            disabled={connection === "connecting"}
            className={buttonSecondary}
          >
            <RefreshCw
              size={14}
              aria-hidden="true"
              className={connection === "connecting" ? "animate-spin" : ""}
            />
            Reconnect
          </button>
        }
      >
        {connection === "connected"
          ? "You can run the supported diagnostic commands below."
          : connection === "connecting"
            ? "The server is validating your administrator session."
            : "Reconnect to establish a new console connection. Your administrator login session is managed by Kinesis."}
      </Notice>


      {/* Backend output */}
      <Section
        id="console-output"
        title="Backend output"
        badge={`${filteredLogs.length.toLocaleString()} entries`}
        actions={
          <>
            <button
              type="button"
              onClick={() =>
                setPaused((current) => !current)
              }
              aria-pressed={paused}
              title={
                paused
                  ? "Resume incoming log display"
                  : "Pause incoming log display"
              }
              className={`${buttonSecondary} ${buttonSmall} ${paused ? "!border-ctp-yellow/50 !text-ctp-yellow" : ""}`}
            >
              {paused ? (
                <Play size={13} aria-hidden="true" />
              ) : (
                <Pause size={13} aria-hidden="true" />
              )}

              {paused
                ? "Resume logs"
                : "Pause logs"}
            </button>

            <button
              type="button"
              onClick={exportLogs}
              disabled={logs.length === 0}
              className={`${buttonSecondary} ${buttonSmall}`}
            >
              <Download size={13} aria-hidden="true" />
              Export
            </button>

            <button
              type="button"
              onClick={clearLogs}
              disabled={logs.length === 0}
              className={`${buttonSecondary} ${buttonSmall}`}
            >
              <Eraser size={13} aria-hidden="true" />
              Clear
            </button>
          </>
        }
        bodyClassName="space-y-3"
      >
        {/* Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="group"
            aria-label="Filter by log level"
            className="inline-flex w-fit max-w-full overflow-x-auto rounded-md border border-ctp-surface1 p-0.5"
          >
            {LOG_FILTERS.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => setFilter(item)}
                aria-pressed={filter === item}
                className={`shrink-0 rounded px-2.5 py-1 text-xs transition ${focusRing} ${filter === item
                    ? "bg-ctp-surface0 font-medium text-ctp-text"
                    : "text-ctp-subtext0 hover:text-ctp-text"
                  }`}
              >
                {formatFilterLabel(item)}
              </button>
            ))}
          </div>

          <SearchInput
            value={search}
            onChange={setSearch}
            label="Filter console messages"
            placeholder="Filter messages"
            className="w-full sm:w-72"
          />
        </div>


        <div className="dark overflow-hidden rounded-md border border-ctp-surface0 bg-ctp-crust text-ctp-text">
          {/* Output panel */}
          <div
            ref={logContainerRef}
            className="h-[340px] overflow-auto px-3 py-3 font-mono text-xs leading-5 sm:h-[420px] sm:px-4"
            aria-live="polite"
            aria-label="Backend console output"
          >
            {filteredLogs.length === 0 ? (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-1 text-center">
                <p className="text-ctp-subtext0">
                  {logs.length === 0
                    ? "No console output yet."
                    : "No entries match your filters."}
                </p>

                <p className="text-ctp-overlay0">
                  {logs.length === 0
                    ? "Connect to the backend or run help to get started."
                    : "Change the level filter or search term."}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredLogs.map((entry) => (
                  <div
                    key={entry.id}
                    className="grid grid-cols-[66px_58px_minmax(0,1fr)] gap-x-2 sm:grid-cols-[72px_70px_minmax(0,1fr)] sm:gap-x-3"
                  >
                    <span className="whitespace-nowrap text-ctp-overlay0">
                      {formatTimestamp(entry.timestamp)}
                    </span>

                    <span
                      className={`font-semibold ${getLevelStyle(entry.level)}`}
                    >
                      {entry.level}
                    </span>

                    <pre
                      className={`min-w-0 whitespace-pre-wrap break-words font-mono ${getLevelStyle(entry.level)}`}
                    >
                      {entry.message}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>


          {paused && (
            <p className="border-t border-ctp-surface0 bg-ctp-yellow/5 px-4 py-2 text-xs text-ctp-yellow">
              Incoming backend log messages are hidden until you resume logs.
              Command results and errors will still appear.
            </p>
          )}
        </div>


        {/* Diagnostic command input */}
        <form onSubmit={handleCommandSubmit} className="pt-2">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label
              htmlFor="console-command"
              className="text-sm font-medium text-ctp-text"
            >
              Diagnostic command
            </label>

            <button
              type="button"
              onClick={() =>
                setShowCommands((current) => !current)
              }
              aria-expanded={showCommands}
              className={`rounded text-xs text-ctp-mauve hover:underline ${focusRing}`}
            >
              {showCommands
                ? "Hide commands"
                : "Supported commands"}
            </button>
          </div>


          {showCommands && (
            <div className="mb-3 grid grid-cols-1 divide-y divide-ctp-surface0 border-y border-ctp-surface0 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
              {COMMAND_EXAMPLES.map((item) => (
                <button
                  type="button"
                  key={item.command}
                  onClick={() => {
                    setCommand(item.command);

                    commandInputRef.current?.focus();
                  }}
                  className={`flex min-w-0 flex-col items-start px-2 py-2 text-left transition hover:bg-ctp-surface0/50 ${focusRing}`}
                >
                  <code className="font-mono text-xs text-ctp-text">
                    {item.command}
                  </code>

                  <span className="mt-0.5 text-xs text-ctp-subtext0">
                    {item.description}
                  </span>
                </button>
              ))}
            </div>
          )}


          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-ctp-surface1 bg-ctp-mantle px-3 transition focus-within:border-ctp-mauve focus-within:ring-1 focus-within:ring-ctp-mauve">
              <span
                aria-hidden="true"
                className="select-none font-mono text-sm text-ctp-green"
              >
                $
              </span>

              <input
                id="console-command"
                ref={commandInputRef}
                type="text"
                value={command}
                onChange={(event) => {
                  setCommand(event.target.value);
                  setHistoryIndex(-1);
                }}
                onKeyDown={handleCommandKeyDown}
                autoComplete="off"
                spellCheck={false}
                maxLength={200}
                placeholder="Type help or a diagnostic command…"
                disabled={connection !== "connected"}
                className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-sm text-ctp-text outline-none placeholder:text-ctp-overlay0 disabled:cursor-not-allowed"
              />
            </div>

            <button
              type="submit"
              disabled={
                connection !== "connected" ||
                !command.trim()
              }
              aria-label="Run diagnostic command"
              className={buttonPrimary}
            >
              <Send size={13} aria-hidden="true" />

              <span className="hidden sm:inline">
                Run
              </span>
            </button>
          </div>


          <p className="mt-2 text-xs leading-relaxed text-ctp-subtext0">
            Commands are restricted by the backend allowlist. This console
            does not provide arbitrary shell or SQL execution. Use ↑ and ↓ to
            browse command history.
          </p>
        </form>
      </Section>
    </div>
  );
}
