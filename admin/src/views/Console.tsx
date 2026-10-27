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
  X,
} from "lucide-react";
import { API_BASE_URL } from "../lib/api";

type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR" | "DEBUG" | "COMMAND";
type ConnectionState = "connecting" | "connected" | "disconnected" | "error";
type LogFilter = "ALL" | LogLevel;

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

const TOKEN_STORAGE_KEY = "kinesis-admin-api-token";
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
  { command: "help", description: "List supported commands" },
  { command: "status", description: "Check API status" },
  { command: "db check", description: "Check database connectivity" },
  { command: "inventory summary", description: "Summarize inventory" },
  { command: "terminals list", description: "List registered terminals" },
  { command: "sales today", description: "Summarize today's sales" },
];

function normalizeLevel(value?: string): LogLevel {
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

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getWebSocketUrl(): string {
  const url = new URL("/api/console/ws", API_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.search = "";
  url.hash = "";

  return url.toString();
}

function getLevelStyle(level: LogLevel): string {
  switch (level) {
    case "SUCCESS":
      return "text-[#a6e3a1]";
    case "WARN":
      return "text-[#f9e2af]";
    case "ERROR":
      return "text-[#f38ba8]";
    case "DEBUG":
      return "text-[#9399b2]";
    case "COMMAND":
      return "text-[#89b4fa]";
    case "INFO":
    default:
      return "text-[#cdd6f4]";
  }
}

function getLevelBadgeStyle(level: LogFilter): string {
  switch (level) {
    case "SUCCESS":
      return "border-[#a6e3a1]/30 bg-[#a6e3a1]/10 text-[#a6e3a1]";
    case "WARN":
      return "border-[#f9e2af]/30 bg-[#f9e2af]/10 text-[#f9e2af]";
    case "ERROR":
      return "border-[#f38ba8]/30 bg-[#f38ba8]/10 text-[#f38ba8]";
    case "DEBUG":
      return "border-[#9399b2]/30 bg-[#9399b2]/10 text-[#9399b2]";
    case "COMMAND":
      return "border-[#89b4fa]/30 bg-[#89b4fa]/10 text-[#89b4fa]";
    case "INFO":
      return "border-[#cdd6f4]/20 bg-[#cdd6f4]/5 text-[#cdd6f4]";
    case "ALL":
    default:
      return "border-[#585b70] bg-[#313244] text-[#cdd6f4]";
  }
}

export default function Console() {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  });

  const [connection, setConnection] =
    useState<ConnectionState>("disconnected");
  const [logs, setLogs] = useState<ConsoleLog[]>([]);
  const [command, setCommand] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [filter, setFilter] = useState<LogFilter>("ALL");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [showCommands, setShowCommands] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const generationRef = useRef(0);
  const authenticatedRef = useRef(false);
  const pausedRef = useRef(paused);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const commandInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const appendLog = useCallback(
    (level: LogLevel, message: string, timestamp?: string) => {
      const entry: ConsoleLog = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: timestamp || new Date().toISOString(),
        level,
        message,
      };

      setLogs((current) => [...current, entry].slice(-MAX_LOG_ENTRIES));
    },
    [],
  );

  const connect = useCallback(() => {
    if (!token) {
      setConnection("error");
      appendLog(
        "ERROR",
        "Admin token not found. Enter it in Terminal Management first, then check the session token here.",
      );
      return;
    }

    generationRef.current += 1;
    const generation = generationRef.current;
    authenticatedRef.current = false;

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
      socket = new WebSocket(getWebSocketUrl());
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
    appendLog("INFO", "Connecting to the Kinesis backend console...");

    socket.onopen = () => {
      if (generation !== generationRef.current) {
        socket.close();
        return;
      }

      try {
        socket.send(JSON.stringify({ type: "auth", token }));
        appendLog("INFO", "Connection opened. Authenticating...");
      } catch {
        setConnection("error");
        appendLog("ERROR", "Could not send the authentication message.");
        socket.close();
      }
    };

    socket.onmessage = (event: MessageEvent<string>) => {
      if (generation !== generationRef.current) {
        return;
      }

      let data: ServerMessage;

      try {
        data = JSON.parse(event.data) as ServerMessage;
      } catch {
        appendLog("WARN", "Received an unreadable message from the server.");
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
          const output = data.output?.trim() || "(No output)";
          appendLog(
            "SUCCESS",
            `${data.command ? `$ ${data.command}\n` : ""}${output}`,
          );
          break;
        }

        case "error": {
          appendLog("ERROR", data.message || "The server reported an error.");

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
            data.message || "Authenticated with the Kinesis backend.",
          );
          break;
        }

        default: {
          appendLog("DEBUG", "Received an unrecognized server message.");
        }
      }
    };

    socket.onerror = () => {
      if (generation === generationRef.current) {
        setConnection("error");
      }
    };

    socket.onclose = () => {
      if (generation !== generationRef.current) {
        return;
      }

      socketRef.current = null;
      setConnection(authenticatedRef.current ? "disconnected" : "error");

      appendLog(
        authenticatedRef.current ? "WARN" : "ERROR",
        authenticatedRef.current
          ? "The console connection closed. Reconnect to continue."
          : "The console connection closed before authentication completed. Check the admin token and backend logs.",
      );

      authenticatedRef.current = false;
    };
  }, [appendLog, token]);

  useEffect(() => {
    if (!token) {
      setConnection("error");
      return;
    }

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
  }, [connect, token]);

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();

    return logs.filter((entry) => {
      const matchesLevel = filter === "ALL" || entry.level === filter;
      const matchesSearch =
        !query ||
        entry.message.toLowerCase().includes(query) ||
        entry.level.toLowerCase().includes(query);

      return matchesLevel && matchesSearch;
    });
  }, [filter, logs, search]);

  // Scroll only the console output panel. Avoid scrollIntoView(), which
  // can also move the page or other ancestor containers.
  useEffect(() => {
    if (paused) {
      return;
    }

    const container = logContainerRef.current;

    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [filteredLogs, paused]);

  const refreshSessionToken = useCallback(() => {
    const storedToken = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    setToken(storedToken);

    if (!storedToken) {
      appendLog(
        "WARN",
        "No admin token was found. Open Terminal Management, enter your admin token, then return to this console.",
      );
    }
  }, [appendLog]);

  const handleCommandSubmit = (event: FormEvent<HTMLFormElement>) => {
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

      appendLog("COMMAND", `$ ${trimmedCommand}`);

      setCommandHistory((current) =>
        [
          ...current.filter((item) => item !== trimmedCommand),
          trimmedCommand,
        ].slice(-100),
      );

      setHistoryIndex(-1);
      setCommand("");
    } catch {
      appendLog("ERROR", "Could not send the command to the backend.");
    }

    commandInputRef.current?.focus();
  };

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
      setCommand(commandHistory[nextIndex]);
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
        setCommand(commandHistory[nextIndex]);
      }
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const exportLogs = () => {
    const content = logs
      .map(
        (entry) =>
          `[${formatTimestamp(entry.timestamp)}] [${entry.level}] ${entry.message}`,
      )
      .join("\n");

    const blob = new Blob([content], {
      type: "text/plain;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `kinesis-console-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.log`;

    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const statusConfig: Record<
    ConnectionState,
    { label: string; color: string }
  > = {
    connecting: {
      label: "Connecting",
      color: "border-[#f9e2af]/30 bg-[#f9e2af]/10 text-[#f9e2af]",
    },
    connected: {
      label: "Connected",
      color: "border-[#a6e3a1]/30 bg-[#a6e3a1]/10 text-[#a6e3a1]",
    },
    disconnected: {
      label: "Disconnected",
      color: "border-[#9399b2]/30 bg-[#9399b2]/10 text-[#bac2de]",
    },
    error: {
      label: "Connection error",
      color: "border-[#f38ba8]/30 bg-[#f38ba8]/10 text-[#f38ba8]",
    },
  };

  return (
    <div className="min-w-0 space-y-5 font-line-seed text-[#cdd6f4]">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#89b4fa]/20 bg-[#89b4fa]/10">
            <TerminalIcon size={22} className="text-[#89b4fa]" />
          </div>

          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Operational Console
            </h1>
            <p className="mt-1 max-w-xl text-sm leading-6 text-[#a6adc8]">
              Inspect backend health, inventory, sales, and registered
              terminals through approved diagnostic commands.
            </p>
          </div>
        </div>

        <div
          className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${statusConfig[connection].color}`}
        >
          {connection === "connected" ? (
            <Wifi size={14} />
          ) : connection === "connecting" ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <WifiOff size={14} />
          )}
          {statusConfig[connection].label}
        </div>
      </header>

      <section className="rounded-xl border border-[#313244] bg-[#1e1e2e] p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            {connection === "connected" ? (
              <CheckCircle2
                size={18}
                className="mt-0.5 shrink-0 text-[#a6e3a1]"
              />
            ) : connection === "connecting" ? (
              <Clock
                size={18}
                className="mt-0.5 shrink-0 text-[#f9e2af]"
              />
            ) : (
              <CircleAlert
                size={18}
                className="mt-0.5 shrink-0 text-[#f38ba8]"
              />
            )}

            <div>
              <p className="text-sm font-medium text-[#cdd6f4]">
                {connection === "connected"
                  ? "Authenticated with the backend"
                  : connection === "connecting"
                    ? "Opening secure console session"
                    : "Console session is not active"}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#a6adc8]">
                {connection === "connected"
                  ? "You can run the supported diagnostic commands below."
                  : token
                    ? "Check the backend terminal output if the connection keeps failing."
                    : "Enter the admin token in Terminal Management, then return here and check the session token."}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {!token && (
              <button
                type="button"
                onClick={refreshSessionToken}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#45475a] px-3 py-2 text-xs font-medium text-[#cdd6f4] transition hover:bg-[#313244]"
              >
                Check session token
              </button>
            )}

            <button
              type="button"
              onClick={connect}
              disabled={!token || connection === "connecting"}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#89b4fa] px-3 py-2 text-xs font-semibold text-[#1e1e2e] transition hover:bg-[#b4befe] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw
                size={14}
                className={connection === "connecting" ? "animate-spin" : ""}
              />
              Reconnect
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#313244] bg-[#181825]">
        <div className="flex flex-col justify-between gap-3 border-b border-[#313244] px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-[#89b4fa]" />
            <h2 className="text-sm font-semibold">Backend output</h2>
            <span className="rounded-md bg-[#313244] px-2 py-0.5 text-[11px] tabular-nums text-[#bac2de]">
              {filteredLogs.length.toLocaleString()} entries
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPaused((current) => !current)}
              title={
                paused
                  ? "Resume incoming log display"
                  : "Pause incoming log display"
              }
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs transition ${paused
                  ? "border-[#f9e2af]/30 bg-[#f9e2af]/10 text-[#f9e2af]"
                  : "border-[#45475a] text-[#bac2de] hover:bg-[#313244]"
                }`}
            >
              {paused ? <Play size={13} /> : <Pause size={13} />}
              {paused ? "Resume logs" : "Pause logs"}
            </button>

            <button
              type="button"
              onClick={exportLogs}
              disabled={logs.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#45475a] px-2.5 py-2 text-xs text-[#bac2de] transition hover:bg-[#313244] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={13} />
              Export
            </button>

            <button
              type="button"
              onClick={clearLogs}
              disabled={logs.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#45475a] px-2.5 py-2 text-xs text-[#bac2de] transition hover:bg-[#313244] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Eraser size={13} />
              Clear
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-[#313244] px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            {LOG_FILTERS.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => setFilter(item)}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition ${filter === item
                    ? getLevelBadgeStyle(item)
                    : "border-transparent text-[#9399b2] hover:bg-[#313244] hover:text-[#cdd6f4]"
                  }`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-[#313244] bg-[#1e1e2e] px-3">
            <Activity size={14} className="shrink-0 text-[#9399b2]" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter messages..."
              aria-label="Filter console messages"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-xs text-[#cdd6f4] outline-none placeholder:text-[#6c7086]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear message filter"
                className="text-[#9399b2] transition hover:text-[#cdd6f4]"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div
          ref={logContainerRef}
          className="h-[340px] overflow-auto bg-[#11111b] px-3 py-3 font-mono text-xs leading-5 sm:h-[420px] sm:px-4"
          aria-live="polite"
          aria-label="Backend console output"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-center">
              <TerminalIcon size={25} className="text-[#45475a]" />
              <p className="text-[#a6adc8]">
                {logs.length === 0
                  ? "No console output yet."
                  : "No entries match your filters."}
              </p>
              <p className="text-[11px] text-[#6c7086]">
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
                  <span className="whitespace-nowrap text-[#6c7086]">
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
          <div className="border-t border-[#45475a] bg-[#f9e2af]/5 px-4 py-2 text-[11px] text-[#f9e2af]">
            Incoming backend log messages are hidden until you resume logs.
            Command results and errors will still appear.
          </div>
        )}

        <form
          onSubmit={handleCommandSubmit}
          className="border-t border-[#313244] bg-[#1e1e2e] p-3 sm:p-4"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <label
              htmlFor="console-command"
              className="text-xs font-medium text-[#bac2de]"
            >
              Diagnostic command
            </label>

            <button
              type="button"
              onClick={() => setShowCommands((current) => !current)}
              className="text-[11px] text-[#89b4fa] transition hover:text-[#b4befe]"
            >
              {showCommands ? "Hide commands" : "Supported commands"}
            </button>
          </div>

          {showCommands && (
            <div className="mb-3 grid grid-cols-1 gap-1.5 rounded-lg border border-[#313244] bg-[#181825] p-2 sm:grid-cols-2">
              {COMMAND_EXAMPLES.map((item) => (
                <button
                  type="button"
                  key={item.command}
                  onClick={() => {
                    setCommand(item.command);
                    commandInputRef.current?.focus();
                  }}
                  className="flex min-w-0 flex-col items-start rounded-md px-2.5 py-2 text-left transition hover:bg-[#313244]"
                >
                  <code className="text-xs text-[#89b4fa]">
                    {item.command}
                  </code>
                  <span className="mt-1 text-[11px] text-[#9399b2]">
                    {item.description}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 rounded-lg border border-[#45475a] bg-[#11111b] px-3 focus-within:border-[#89b4fa]/60">
            <span className="select-none font-mono text-sm text-[#a6e3a1]">
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
              placeholder="Type help or a diagnostic command..."
              disabled={connection !== "connected"}
              className="min-w-0 flex-1 bg-transparent py-3 font-mono text-xs text-[#cdd6f4] outline-none placeholder:text-[#585b70] disabled:cursor-not-allowed"
            />

            <button
              type="submit"
              disabled={connection !== "connected" || !command.trim()}
              aria-label="Run diagnostic command"
              className="inline-flex items-center gap-2 rounded-md bg-[#89b4fa] px-3 py-2 text-xs font-semibold text-[#1e1e2e] transition hover:bg-[#b4befe] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={13} />
              <span className="hidden sm:inline">Run</span>
            </button>
          </div>

          <p className="mt-2 text-[10px] leading-5 text-[#6c7086]">
            Commands are restricted by the backend allowlist. This console
            does not provide arbitrary shell or SQL execution.
          </p>
        </form>
      </section>
    </div>
  );
}
