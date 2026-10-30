import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";

import {
  connectTerminalSettingsSocket,
  fetchTerminalSettings,
  type TerminalPOSSettings,
  type TerminalSettingsSocketMessage,
} from "@/lib/terminalAgentApi";

const SETTINGS_CACHE_KEY = "kinesis-terminal-pos-settings";
const SETTINGS_REFRESH_INTERVAL_MS = 60_000;

const SOCKET_RECONNECT_INITIAL_MS = 1_000;
const SOCKET_RECONNECT_MAX_MS = 30_000;

export type TerminalSettingsStatus =
  | "not-connected"
  | "loading"
  | "synced"
  | "offline"
  | "error";

type CachedSettings = {
  settings: TerminalPOSSettings;
  version: number;
  updated_at: string;
};

type TerminalSettingsContextValue = {
  settings: TerminalPOSSettings | null;
  version: number | null;
  updatedAt: string | null;
  status: TerminalSettingsStatus;
  error: string | null;
  refreshSettings: () => Promise<void>;
};

const TerminalSettingsContext =
  createContext<TerminalSettingsContextValue | null>(null);

function isCachedSettings(value: unknown): value is CachedSettings {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.settings === "object" &&
    candidate.settings !== null &&
    typeof candidate.version === "number" &&
    typeof candidate.updated_at === "string"
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Could not synchronize terminal settings.";
}

type TerminalSettingsProviderProps = {
  sessionToken: string | null;
  children: ReactNode;
};

export function TerminalSettingsProvider({
  sessionToken,
  children,
}: TerminalSettingsProviderProps) {
  const [settings, setSettings] =
    useState<TerminalPOSSettings | null>(null);

  const [version, setVersion] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [status, setStatus] =
    useState<TerminalSettingsStatus>("not-connected");

  const [error, setError] = useState<string | null>(null);

  const refreshing = useRef(false);
  const refreshQueued = useRef(false);

  const refreshSettings = useCallback(
    async (signal?: AbortSignal) => {
      if (!sessionToken) {
        return;
      }

      // Do not silently lose a refresh request if another request
      // is already running. Queue one follow-up refresh.
      if (refreshing.current) {
        refreshQueued.current = true;
        return;
      }

      refreshing.current = true;

      try {
        const response = await fetchTerminalSettings(
          sessionToken,
          signal,
        );

        if (signal?.aborted) return;

        setSettings(response.settings);
        setVersion(response.version);
        setUpdatedAt(response.updated_at);
        setStatus("synced");
        setError(null);

        try {
          await SecureStore.setItemAsync(
            SETTINGS_CACHE_KEY,
            JSON.stringify(response),
          );
        } catch (cacheError) {
          console.warn(
            "[Terminal Settings] Could not cache settings:",
            getErrorMessage(cacheError),
          );
        }
      } catch (fetchError) {
        if (signal?.aborted) return;

        setError(getErrorMessage(fetchError));

        setStatus((current) =>
          current === "synced" || current === "offline"
            ? "offline"
            : "error",
        );

        console.warn(
          "[Terminal Settings] Synchronization failed:",
          getErrorMessage(fetchError),
        );
      } finally {
        refreshing.current = false;

        if (signal?.aborted) {
          refreshQueued.current = false;
        } else if (refreshQueued.current) {
          refreshQueued.current = false;
          void refreshSettings();
        }
      }
    },
    [sessionToken],
  );

  useEffect(() => {
    if (!sessionToken) {
      setStatus("not-connected");
      setError(null);
      refreshQueued.current = false;
      return;
    }

    let cancelled = false;
    let activeSocket: WebSocket | null = null;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;

    const controller = new AbortController();

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer !== null) {
        return;
      }

      const delay = Math.min(
        SOCKET_RECONNECT_INITIAL_MS * 2 ** reconnectAttempt,
        SOCKET_RECONNECT_MAX_MS,
      );

      reconnectAttempt += 1;

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectSocket();
      }, delay);

      console.log(
        `[Terminal Settings] WebSocket reconnect scheduled in ${delay}ms.`,
      );
    };

    const connectSocket = () => {
      if (cancelled) {
        return;
      }

      if (
        activeSocket &&
        (
          activeSocket.readyState === WebSocket.CONNECTING ||
          activeSocket.readyState === WebSocket.OPEN
        )
      ) {
        return;
      }

      try {
        const socket = connectTerminalSettingsSocket(sessionToken);
        activeSocket = socket;

        socket.onmessage = (event) => {
          if (cancelled) {
            return;
          }

          let message: TerminalSettingsSocketMessage;

          try {
            message = JSON.parse(
              String(event.data),
            ) as TerminalSettingsSocketMessage;
          } catch {
            console.warn(
              "[Terminal Settings] Received an invalid WebSocket message.",
            );
            return;
          }

          if (message.type === "authenticated") {
            reconnectAttempt = 0;

            console.log(
              "[Terminal Settings] Realtime connection authenticated.",
            );

            // Fetch once after every successful connection.
            // This also recovers changes made while the phone was offline.
            void refreshSettings();

            return;
          }

          if (message.type === "settings_updated") {
            console.log(
              "[Terminal Settings] Settings update received.",
              { version: message.version },
            );

            void refreshSettings();
            return;
          }

          if (message.type === "ping") {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(
                JSON.stringify({
                  type: "pong",
                }),
              );
            }
          }
        };

        socket.onerror = () => {
          console.warn(
            "[Terminal Settings] WebSocket connection error.",
          );

          try {
            socket.close();
          } catch {
            // The close event will schedule reconnection.
          }
        };

        socket.onclose = () => {
          if (activeSocket === socket) {
            activeSocket = null;
          }

          scheduleReconnect();
        };
      } catch (socketError) {
        console.warn(
          "[Terminal Settings] Could not create WebSocket:",
          getErrorMessage(socketError),
        );

        scheduleReconnect();
      }
    };

    async function initializeSettings() {
      setStatus("loading");
      setError(null);

      // Load the previous successful response before contacting the server.
      try {
        const cached = await SecureStore.getItemAsync(
          SETTINGS_CACHE_KEY,
        );

        if (cancelled) return;

        if (cached) {
          const parsed: unknown = JSON.parse(cached);

          if (isCachedSettings(parsed)) {
            setSettings(parsed.settings);
            setVersion(parsed.version);
            setUpdatedAt(parsed.updated_at);
            setStatus("offline");
          }
        }
      } catch (cacheError) {
        console.warn(
          "[Terminal Settings] Could not load cached settings:",
          getErrorMessage(cacheError),
        );
      }

      if (cancelled) return;

      await refreshSettings(controller.signal);
    }

    void initializeSettings();

    // Establish the realtime connection.
    connectSocket();

    // Keep the existing 60-second HTTP fallback.
    const interval = setInterval(() => {
      if (!cancelled && AppState.currentState === "active") {
        void refreshSettings();
      }
    }, SETTINGS_REFRESH_INTERVAL_MS);

    // Refresh immediately when the app returns to the foreground.
    const subscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (cancelled || nextState !== "active") {
          return;
        }

        void refreshSettings();

        // Reconnect immediately if the socket closed while backgrounded.
        if (
          !activeSocket ||
          activeSocket.readyState === WebSocket.CLOSED
        ) {
          clearReconnectTimer();
          connectSocket();
        }
      },
    );

    return () => {
      cancelled = true;

      controller.abort();
      clearInterval(interval);
      subscription.remove();
      clearReconnectTimer();

      if (activeSocket) {
        activeSocket.onmessage = null;
        activeSocket.onerror = null;
        activeSocket.onclose = null;

        try {
          activeSocket.close();
        } catch {
          // The provider is already being cleaned up.
        }

        activeSocket = null;
      }
    };
  }, [sessionToken, refreshSettings]);

  const value = useMemo<TerminalSettingsContextValue>(
    () => ({
      settings,
      version,
      updatedAt,
      status,
      error,
      refreshSettings: () => refreshSettings(),
    }),
    [
      settings,
      version,
      updatedAt,
      status,
      error,
      refreshSettings,
    ],
  );

  return (
    <TerminalSettingsContext.Provider value={value}>
      {children}
    </TerminalSettingsContext.Provider>
  );
}

export function useTerminalSettings() {
  const context = useContext(TerminalSettingsContext);

  if (!context) {
    throw new Error(
      "useTerminalSettings must be used inside TerminalSettingsProvider.",
    );
  }

  return context;
}
