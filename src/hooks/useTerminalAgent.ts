
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";

import { ApiError } from "@/lib/api";
import { useCatalog } from "@/app/context/CatalogContext";

import {
  acknowledgeTerminalCommand,
  pairTerminal,
  sendTerminalHeartbeat,
  type TerminalCommand,
} from "@/lib/terminalAgentApi";

const DEVICE_ID_KEY = "kinesis-terminal-device-id";
const SESSION_TOKEN_KEY = "kinesis-terminal-session-token";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DISABLED_RETRY_INTERVAL_MS = 15_000;

export type TerminalBroadcastNotice = {
  id: number;
  message: string;
  created_at: string;
};

function createDeviceId(): string {
  return [
    "KNS",
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 14),
    Math.random().toString(36).slice(2, 10),
  ].join("-");
}

function getDeviceName(): string {
  return (
    Device.deviceName?.trim() ||
    Device.modelName?.trim() ||
    `Kinesis ${Platform.OS} POS`
  ).slice(0, 100);
}

function getDeviceType(): string {
  if (Platform.OS === "android") return "Android POS";
  if (Platform.OS === "ios") return "iOS POS";

  return `${Platform.OS} POS`.slice(0, 60);
}

function getPlatformName(): string {
  return (Device.osName || Platform.OS).slice(0, 32);
}

function getAppVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unexpected terminal pairing error occurred.";
}

export type TerminalAgentStatus =
  | "initializing"
  | "enrollment-required"
  | "registering"
  | "active"
  | "registration-error"
  | "storage-error";

export function useTerminalAgent(
  onSessionTokenChange?: (token: string | null) => void,
) {
  const { synchronizeCatalog } = useCatalog();

  const [status, setStatus] =
    useState<TerminalAgentStatus>("initializing");

  const [deviceId, setDeviceId] = useState("");
  const [message, setMessage] = useState("");
  const [sessionToken, setSessionToken] =
    useState<string | null>(null);

  const [accessDisabled, setAccessDisabled] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const [broadcastQueue, setBroadcastQueue] =
    useState<TerminalBroadcastNotice[]>([]);

  const processingCommandIds = useRef<Set<number>>(new Set());

  // --------------------------------------------------
  // Initialize device identity and saved credentials
  // --------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        let storedDeviceId =
          await SecureStore.getItemAsync(DEVICE_ID_KEY);

        const storedToken =
          await SecureStore.getItemAsync(SESSION_TOKEN_KEY);

        if (!storedDeviceId) {
          storedDeviceId = createDeviceId();

          await SecureStore.setItemAsync(
            DEVICE_ID_KEY,
            storedDeviceId,
          );
        }

        if (cancelled) return;

        setDeviceId(storedDeviceId);

        if (storedToken) {
          setSessionToken(storedToken);
          onSessionTokenChange?.(storedToken);
          setStatus("active");
        } else {
          onSessionTokenChange?.(null);
          setStatus("enrollment-required");
        }
      } catch (error) {
        if (cancelled) return;

        setMessage(
          `Secure storage could not be initialized: ${errorMessage(error)}`,
        );

        setStatus("storage-error");
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [onSessionTokenChange]);

  // --------------------------------------------------
  // Return an invalidated terminal to QR pairing
  // --------------------------------------------------

  const clearInvalidTerminalSession = useCallback(async () => {
    try {
      await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    } catch (error) {
      console.error(
        "[Terminal] Could not remove invalid terminal credentials:",
        errorMessage(error),
      );

      setMessage(
        "The saved terminal credential is invalid, but secure storage could not clear it. Restart the app and try again.",
      );

      setStatus("storage-error");
      return;
    }

    processingCommandIds.current.clear();

    setSessionToken(null);
    setAccessDisabled(false);
    setMaintenanceMode(false);

    setMessage(
      "This terminal is no longer registered. Scan a new pairing QR code from Terminal Management.",
    );

    onSessionTokenChange?.(null);
    setStatus("enrollment-required");
  }, [onSessionTokenChange]);

  // --------------------------------------------------
  // Pair using an administrator-issued QR token
  // --------------------------------------------------

  const pair = useCallback(
    async (pairingToken: string): Promise<boolean> => {
      if (!deviceId) {
        setMessage(
          "The device identity is not ready. Restart the app.",
        );

        setStatus("registration-error");
        return false;
      }

      const token = pairingToken.trim();

      if (!token) {
        setMessage("The QR pairing code is empty.");
        setStatus("registration-error");
        return false;
      }

      setMessage("");
      setStatus("registering");

      try {
        const registration = await pairTerminal(
          {
            device_id: deviceId,
            name: getDeviceName(),
            device_type: getDeviceType(),
            platform: getPlatformName(),
            app_version: getAppVersion(),
          },
          token,
        );

        // Save the permanent credential before activating the terminal.
        await SecureStore.setItemAsync(
          SESSION_TOKEN_KEY,
          registration.session_token,
        );

        processingCommandIds.current.clear();

        setSessionToken(registration.session_token);
        setAccessDisabled(false);
        setMaintenanceMode(registration.maintenance_mode);

        onSessionTokenChange?.(registration.session_token);

        setStatus("active");
        setMessage("");

        return true;
      } catch (error) {
        setMessage(errorMessage(error));
        setStatus("registration-error");

        return false;
      }
    },
    [deviceId, onSessionTokenChange],
  );

  // --------------------------------------------------
  // Command acknowledgment
  // --------------------------------------------------

  const acknowledgeCommand = useCallback(
    async (
      activeSessionToken: string,
      commandId: number,
      commandStatus: "acknowledged" | "failed",
      resultMessage: string,
    ): Promise<boolean> => {
      try {
        await acknowledgeTerminalCommand(
          activeSessionToken,
          commandId,
          commandStatus,
          resultMessage.slice(0, 300),
        );

        console.info(
          `[Terminal] Command ${commandId} ${commandStatus}.`,
        );

        return true;
      } catch (error) {
        console.warn(
          `[Terminal] Could not acknowledge command ${commandId}:`,
          errorMessage(error),
        );

        return false;
      }
    },
    [],
  );

  // --------------------------------------------------
  // Process pending commands
  // --------------------------------------------------

  const processCommands = useCallback(
    async (
      commands: TerminalCommand[],
      activeSessionToken: string,
    ) => {
      for (const command of commands) {
        if (processingCommandIds.current.has(command.id)) {
          continue;
        }

        processingCommandIds.current.add(command.id);

        if (command.command_type === "sync") {
          try {
            const result = await synchronizeCatalog();

            const acknowledged = await acknowledgeCommand(
              activeSessionToken,
              command.id,
              "acknowledged",
              `Synchronization completed. ${result.productCount} products and ${result.serviceCount} services loaded.`,
            );

            if (!acknowledged) {
              processingCommandIds.current.delete(command.id);
            }
          } catch (error) {
            const message = errorMessage(error);

            const acknowledged = await acknowledgeCommand(
              activeSessionToken,
              command.id,
              "failed",
              `Synchronization failed: ${message}`,
            );

            if (!acknowledged) {
              processingCommandIds.current.delete(command.id);
            }
          }

          continue;
        }

        if (command.command_type === "broadcast") {
          const broadcastMessage = command.payload?.trim();

          if (!broadcastMessage) {
            const acknowledged = await acknowledgeCommand(
              activeSessionToken,
              command.id,
              "failed",
              "The broadcast message was empty.",
            );

            if (!acknowledged) {
              processingCommandIds.current.delete(command.id);
            }

            continue;
          }

          setBroadcastQueue((previous) => {
            if (previous.some((item) => item.id === command.id)) {
              return previous;
            }

            return [
              ...previous,
              {
                id: command.id,
                message: broadcastMessage,
                created_at: command.created_at,
              },
            ];
          });

          console.info(
            `[Terminal] Broadcast ${command.id} received.`,
          );
        }
      }
    },
    [acknowledgeCommand, synchronizeCatalog],
  );

  // --------------------------------------------------
  // Broadcast acknowledgment
  // --------------------------------------------------

  const dismissBroadcast = useCallback(() => {
    const currentBroadcast = broadcastQueue[0];

    if (!currentBroadcast || !sessionToken) {
      return;
    }

    setBroadcastQueue((previous) =>
      previous.filter(
        (item) => item.id !== currentBroadcast.id,
      ),
    );

    void acknowledgeCommand(
      sessionToken,
      currentBroadcast.id,
      "acknowledged",
      "Broadcast displayed and acknowledged by the terminal operator.",
    ).then((acknowledged) => {
      if (!acknowledged) {
        processingCommandIds.current.delete(currentBroadcast.id);
      }
    });
  }, [
    broadcastQueue,
    sessionToken,
    acknowledgeCommand,
  ]);

  // --------------------------------------------------
  // Heartbeat and command polling
  // --------------------------------------------------

  useEffect(() => {
    if (!deviceId || !sessionToken || status !== "active") {
      return;
    }

    const activeSessionToken = sessionToken;

    let cancelled = false;
    let running = false;

    let timer: ReturnType<typeof setTimeout> | undefined;

    let intervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS;

    function clearTimer() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    }

    function scheduleNextHeartbeat() {
      clearTimer();

      if (cancelled || AppState.currentState !== "active") {
        return;
      }

      timer = setTimeout(() => {
        void sendHeartbeat();
      }, intervalMs);
    }

    async function sendHeartbeat() {
      if (
        cancelled ||
        running ||
        AppState.currentState !== "active"
      ) {
        return;
      }

      running = true;

      try {
        const response = await sendTerminalHeartbeat(
          activeSessionToken,
          getAppVersion(),
        );

        if (cancelled) return;

        intervalMs = Math.max(
          5_000,
          Math.min(
            30_000,
            response.heartbeat_interval_seconds * 1_000,
          ),
        );

        setAccessDisabled(false);
        setMessage("");
        setMaintenanceMode(response.maintenance_mode);

        if (!response.is_enabled) {
          setAccessDisabled(true);
          intervalMs = DISABLED_RETRY_INTERVAL_MS;
        }

        if (response.commands.length > 0) {
          void processCommands(
            response.commands,
            activeSessionToken,
          );
        }
      } catch (error) {
        if (!cancelled) {
          if (
            error instanceof ApiError &&
            error.status === 401
          ) {
            console.warn(
              "[Terminal] Saved credentials are no longer registered. Returning to QR pairing.",
            );

            await clearInvalidTerminalSession();
          } else if (
            error instanceof ApiError &&
            error.status === 403
          ) {
            setAccessDisabled(true);
            setMaintenanceMode(false);

            setMessage(
              "This terminal has been disabled by an administrator.",
            );

            intervalMs = DISABLED_RETRY_INTERVAL_MS;
          } else {
            console.warn(
              "[Terminal] Heartbeat failed:",
              errorMessage(error),
            );
          }
        }
      } finally {
        running = false;

        if (!cancelled) {
          scheduleNextHeartbeat();
        }
      }
    }

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState === "active") {
          clearTimer();
          void sendHeartbeat();
        } else {
          clearTimer();
        }
      },
    );

    void sendHeartbeat();

    return () => {
      cancelled = true;
      clearTimer();
      appStateSubscription.remove();
    };
  }, [
    deviceId,
    sessionToken,
    status,
    processCommands,
    clearInvalidTerminalSession,
  ]);

  return {
    status,
    deviceId,
    message,
    accessDisabled,
    maintenanceMode,
    broadcastQueue,
    dismissBroadcast,
    pair,
  };
}
