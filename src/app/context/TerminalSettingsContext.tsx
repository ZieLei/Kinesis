
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

import {
  AppState,
  type ImageURISource,
} from "react-native";

import { deviceCache } from "@/lib/deviceCache";

import {
  connectTerminalSettingsSocket,
  fetchTerminalSettings,
  type TerminalPOSSettings,
  type TerminalSettingsSocketMessage,
} from "@/lib/terminalAgentApi";

import {
  apiFetch,
  isNetworkError,
} from "@/lib/api";


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

export type GCashQrImageStatus =
  | "idle"
  | "loading"
  | "loaded"
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
  gcashQrImageSource: ImageURISource | null;
  gcashQrImageStatus: GCashQrImageStatus;
  gcashQrImageError: string | null;
  refreshGcashQrImage: () => void;
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


function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(
          new Error("The downloaded GCash QR image could not be decoded."),
        );
      }
    };

    reader.onerror = () => {
      reject(
        new Error("Could not read the downloaded GCash QR image."),
      );
    };

    reader.readAsDataURL(blob);
  });
}


type TerminalSettingsProviderProps = {
  terminalPaired: boolean;
  children: ReactNode;
};


export function TerminalSettingsProvider({
  terminalPaired,
  children,
}: TerminalSettingsProviderProps) {
  const [settings, setSettings] =
    useState<TerminalPOSSettings | null>(null);

  const [version, setVersion] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [status, setStatus] =
    useState<TerminalSettingsStatus>("not-connected");

  const [error, setError] = useState<string | null>(null);

  const [gcashQrImageUri, setGcashQrImageUri] =
    useState<string | null>(null);

  const [gcashQrImageStatus, setGcashQrImageStatus] =
    useState<GCashQrImageStatus>("idle");

  const [gcashQrImageError, setGcashQrImageError] =
    useState<string | null>(null);

  const [gcashQrReloadKey, setGcashQrReloadKey] = useState(0);


  // --------------------------------------------------
  // Request coordination
  // --------------------------------------------------


  const refreshing = useRef(false);
  const refreshQueued = useRef(false);

  const requestGeneration = useRef(0);

  const activeRequest = useRef<AbortController | null>(null);

  const networkFailureLogged = useRef(false);
  const socketFailureLogged = useRef(false);


  // --------------------------------------------------
  // Fetch settings
  // --------------------------------------------------


  const refreshSettings = useCallback(async () => {
    if (!terminalPaired) {
      return;
    }

    // Coalesce concurrent refresh requests into one follow-up.
    if (refreshing.current) {
      refreshQueued.current = true;
      return;
    }

    const controller = new AbortController();
    const requestId = ++requestGeneration.current;

    activeRequest.current = controller;
    refreshing.current = true;

    try {
      const response = await fetchTerminalSettings(
        controller.signal,
      );

      if (
        controller.signal.aborted ||
        requestGeneration.current !== requestId
      ) {
        return;
      }

      setSettings(response.settings);
      setVersion(response.version);
      setUpdatedAt(response.updated_at);

      setStatus("synced");
      setError(null);

      networkFailureLogged.current = false;

      try {
        // Non-secret display settings.
        await deviceCache.setItem(
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
      if (
        controller.signal.aborted ||
        requestGeneration.current !== requestId
      ) {
        return;
      }

      setError(getErrorMessage(fetchError));

      if (isNetworkError(fetchError)) {
        setStatus("offline");

        if (!networkFailureLogged.current) {
          networkFailureLogged.current = true;

          console.info(
            "[Terminal Settings] Server unavailable. Keeping cached settings and retrying.",
          );
        }
      } else {
        setStatus("error");

        console.warn(
          "[Terminal Settings] Synchronization failed:",
          getErrorMessage(fetchError),
        );
      }
    } finally {
      if (requestGeneration.current === requestId) {
        refreshing.current = false;
        activeRequest.current = null;

        if (
          refreshQueued.current &&
          !controller.signal.aborted
        ) {
          refreshQueued.current = false;
          void refreshSettings();
        }
      }
    }
  }, [terminalPaired]);


  // --------------------------------------------------
  // Restore cached settings and establish live updates
  // --------------------------------------------------


  useEffect(() => {
    if (!terminalPaired) {
      setSettings(null);
      setVersion(null);
      setUpdatedAt(null);

      setStatus("not-connected");
      setError(null);

      setGcashQrImageUri(null);
      setGcashQrImageStatus("idle");
      setGcashQrImageError(null);

      refreshQueued.current = false;
      networkFailureLogged.current = false;
      socketFailureLogged.current = false;

      return;
    }

    let cancelled = false;

    let activeSocket: WebSocket | null = null;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;

    requestGeneration.current += 1;

    activeRequest.current?.abort();
    activeRequest.current = null;

    refreshing.current = false;
    refreshQueued.current = false;

    networkFailureLogged.current = false;
    socketFailureLogged.current = false;


    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };


    // --------------------------------------------------
    // WebSocket reconnection
    // --------------------------------------------------


    const scheduleReconnect = () => {
      if (
        cancelled ||
        reconnectTimer !== null ||
        AppState.currentState !== "active"
      ) {
        return;
      }

      const exponent = Math.min(reconnectAttempt, 5);

      const delay = Math.min(
        SOCKET_RECONNECT_INITIAL_MS * 2 ** exponent,
        SOCKET_RECONNECT_MAX_MS,
      );

      reconnectAttempt += 1;

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectSocket();
      }, delay);
    };


    const connectSocket = () => {
      if (
        cancelled ||
        AppState.currentState !== "active"
      ) {
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
        const socket = connectTerminalSettingsSocket();

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
            socketFailureLogged.current = false;

            console.info(
              "[Terminal Settings] Realtime connection restored.",
            );

            void refreshSettings();

            return;
          }


          if (message.type === "settings_updated") {
            void refreshSettings();

            return;
          }


          if (message.type === "ping") {
            if (
              socket.readyState === WebSocket.OPEN &&
              message.ping_id
            ) {
              socket.send(
                JSON.stringify({
                  type: "pong",
                  ping_id: message.ping_id,
                }),
              );
            }
          }
        };


        socket.onerror = () => {
          if (!cancelled && !socketFailureLogged.current) {
            socketFailureLogged.current = true;

            console.info(
              "[Terminal Settings] Realtime connection unavailable. Reconnecting automatically.",
            );
          }

          try {
            socket.close();
          } catch {
            // The close handler schedules the next attempt.
          }
        };


        socket.onclose = (event) => {
          if (activeSocket === socket) {
            activeSocket = null;
          }

          if (
            event.code === 4403 &&
            !socketFailureLogged.current
          ) {
            socketFailureLogged.current = true;

            console.warn(
              "[Terminal Settings] Server rejected the terminal WebSocket connection.",
            );
          }

          scheduleReconnect();
        };
      } catch (socketError) {
        if (!socketFailureLogged.current) {
          socketFailureLogged.current = true;

          console.info(
            "[Terminal Settings] Could not establish realtime connection. Retrying automatically.",
            getErrorMessage(socketError),
          );
        }

        scheduleReconnect();
      }
    };


    // --------------------------------------------------
    // Restore cached settings before contacting the server
    // --------------------------------------------------


    async function initializeSettings() {
      setStatus("loading");
      setError(null);

      try {
        const cached = await deviceCache.getItem(
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

      await refreshSettings();
    }


    void initializeSettings();

    connectSocket();


    // --------------------------------------------------
    // Periodic settings refresh
    // --------------------------------------------------


    const interval = setInterval(() => {
      if (
        !cancelled &&
        AppState.currentState === "active"
      ) {
        void refreshSettings();
      }
    }, SETTINGS_REFRESH_INTERVAL_MS);


    // --------------------------------------------------
    // App foreground/background handling
    // --------------------------------------------------


    const subscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (cancelled) {
          return;
        }

        if (nextState !== "active") {
          clearReconnectTimer();
          return;
        }

        void refreshSettings();

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

      requestGeneration.current += 1;

      activeRequest.current?.abort();
      activeRequest.current = null;

      refreshing.current = false;
      refreshQueued.current = false;

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
          // Provider is already being cleaned up.
        }

        activeSocket = null;
      }
    };
  }, [
    terminalPaired,
    refreshSettings,
  ]);


  // --------------------------------------------------
  // Authenticated GCash QR image download
  // --------------------------------------------------


  const refreshGcashQrImage = useCallback(() => {
    setGcashQrReloadKey((current) => current + 1);
  }, []);


  useEffect(() => {
    const filename = settings?.gcashQrImagePath;

    if (
      !terminalPaired ||
      !filename ||
      version === null
    ) {
      setGcashQrImageUri(null);
      setGcashQrImageStatus("idle");
      setGcashQrImageError(null);

      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function downloadGcashQr() {
      setGcashQrImageUri(null);
      setGcashQrImageStatus("loading");
      setGcashQrImageError(null);

      try {
        const response = await apiFetch(
          `/api/terminals/gcash-qr?version=${encodeURIComponent(String(version))}`,
          {
            method: "GET",
            headers: {
              Accept: "image/png,image/jpeg",
            },
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          let responseDetail = "";

          try {
            responseDetail = (await response.text()).slice(0, 300);
          } catch {
            // The HTTP status is still useful without a response body.
          }

          throw new Error(
            `GCash QR request failed (${response.status})` +
            (responseDetail ? `: ${responseDetail}` : ""),
          );
        }

        const contentType = response.headers
          .get("content-type")
          ?.split(";")[0]
          .trim()
          .toLowerCase();

        if (
          contentType &&
          contentType !== "image/png" &&
          contentType !== "image/jpeg"
        ) {
          throw new Error(
            `The server returned an unexpected image type: ${contentType}.`,
          );
        }

        const blob = await response.blob();
        const dataUri = await blobToDataUri(blob);

        if (cancelled) return;

        setGcashQrImageUri(dataUri);
        setGcashQrImageStatus("loaded");

        console.info(
          "[Terminal Settings] GCash QR image downloaded successfully.",
        );
      } catch (downloadError) {
        if (
          cancelled ||
          controller.signal.aborted
        ) {
          return;
        }

        const message = getErrorMessage(downloadError);

        setGcashQrImageUri(null);
        setGcashQrImageStatus("error");
        setGcashQrImageError(message);

        console.warn(
          "[Terminal Settings] GCash QR image download failed:",
          message,
        );
      }
    }

    void downloadGcashQr();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    terminalPaired,
    settings?.gcashQrImagePath,
    version,
    gcashQrReloadKey,
  ]);


  // --------------------------------------------------
  // GCash QR image source
  // --------------------------------------------------


  const gcashQrImageSource = useMemo<ImageURISource | null>(() => {
    if (!gcashQrImageUri) {
      return null;
    }

    // Authentication has already been handled by fetch().
    // Image receives a local data URI and needs no request headers.
    return {
      uri: gcashQrImageUri,
    };
  }, [gcashQrImageUri]);


  // --------------------------------------------------
  // Context value
  // --------------------------------------------------


  const value = useMemo<TerminalSettingsContextValue>(
    () => ({
      settings,
      version,
      updatedAt,
      status,
      error,
      refreshSettings,
      gcashQrImageSource,
      gcashQrImageStatus,
      gcashQrImageError,
      refreshGcashQrImage,
    }),
    [
      settings,
      version,
      updatedAt,
      status,
      error,
      refreshSettings,
      gcashQrImageSource,
      gcashQrImageStatus,
      gcashQrImageError,
      refreshGcashQrImage,
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
