import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";

import {
  ApiError,
  isNetworkError,
} from "@/lib/api";
import { credentials } from "@/lib/auth/credentials";
import { deviceCache } from "@/lib/deviceCache";
import { randomCode } from "@/lib/secureRandom";

import { useCatalog } from "@/app/context/CatalogContext";

import {
  acknowledgeTerminalCommand,
  pairTerminal,
  sendTerminalHeartbeat,
  type TerminalCommand,
} from "@/lib/terminalAgentApi";


// Non-secret device identifier (unchanged key so existing installs keep it).
const DEVICE_ID_KEY = "kinesis-terminal-device-id";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DISABLED_RETRY_INTERVAL_MS = 15_000;

const NETWORK_RETRY_BASE_MS = 3_000;
const NETWORK_RETRY_MAX_MS = 30_000;


export type TerminalBroadcastNotice = {
  id: number;
  message: string;
  created_at: string;
};

export type TerminalConnectionStatus =
  | "unknown"
  | "checking"
  | "online"
  | "offline";


function createDeviceId(): string {
  // 100 bits from the platform CSPRNG; the timestamp only aids support.
  return [
    "KNS",
    Date.now().toString(36),
    randomCode(20),
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
    : "An unexpected terminal error occurred.";
}

function getNetworkRetryDelay(failureCount: number): number {
  const delay =
    NETWORK_RETRY_BASE_MS *
    Math.pow(2, Math.max(0, failureCount - 1));

  return Math.min(
    delay,
    NETWORK_RETRY_MAX_MS,
  );
}


export type TerminalAgentStatus =
  | "initializing"
  | "enrollment-required"
  | "registering"
  | "active"
  | "registration-error"
  | "storage-error";


export function useTerminalAgent(
  onPairedChange?: (paired: boolean) => void,
) {
  const { synchronizeCatalog } = useCatalog();

  const [status, setStatus] =
    useState<TerminalAgentStatus>("initializing");

  const [connectionStatus, setConnectionStatus] =
    useState<TerminalConnectionStatus>("unknown");

  const connectionStatusRef = useRef<TerminalConnectionStatus>(
    "unknown",
  );

  const [deviceId, setDeviceId] = useState("");
  const [message, setMessage] = useState("");

  // Raw credentials never enter React state; they stay in the keystore
  // (native) or an HttpOnly cookie (web).
  const [paired, setPaired] = useState(false);

  const [accessDisabled, setAccessDisabled] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const [broadcastQueue, setBroadcastQueue] =
    useState<TerminalBroadcastNotice[]>([]);

  const processingCommandIds = useRef<Set<number>>(new Set());


  // True for a few seconds after the server comes back, so the cashier
  // sees that the outage is over instead of the warning just vanishing.
  const [justReconnected, setJustReconnected] = useState(false);

  const updateConnectionStatus = useCallback(
    (nextStatus: TerminalConnectionStatus) => {
      if (
        connectionStatusRef.current === "offline" &&
        nextStatus === "online"
      ) {
        setJustReconnected(true);
        setTimeout(() => setJustReconnected(false), 3500);
      }

      connectionStatusRef.current = nextStatus;
      setConnectionStatus(nextStatus);
    },
    [],
  );


  // --------------------------------------------------
  // Initialize device identity and saved credentials
  // --------------------------------------------------


  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        let storedDeviceId =
          await deviceCache.getItem(DEVICE_ID_KEY);

        const hasCredential = await credentials.loadTerminal();

        if (!storedDeviceId) {
          storedDeviceId = createDeviceId();

          await deviceCache.setItem(
            DEVICE_ID_KEY,
            storedDeviceId,
          );
        }

        if (cancelled) return;

        setDeviceId(storedDeviceId);

        if (hasCredential) {
          setPaired(true);
          onPairedChange?.(true);

          updateConnectionStatus("checking");
          setStatus("active");
        } else {
          onPairedChange?.(false);

          updateConnectionStatus("unknown");
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
  }, [
    onPairedChange,
    updateConnectionStatus,
  ]);


  // --------------------------------------------------
  // Return an invalidated terminal to QR pairing
  // --------------------------------------------------


  const clearInvalidTerminalSession = useCallback(async () => {
    try {
      await credentials.clearTerminal();
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

    setPaired(false);
    setAccessDisabled(false);
    setMaintenanceMode(false);

    setMessage(
      "This terminal is no longer registered. Scan a new pairing QR code from Terminal Management.",
    );

    onPairedChange?.(false);

    updateConnectionStatus("unknown");
    setStatus("enrollment-required");
  }, [
    onPairedChange,
    updateConnectionStatus,
  ]);


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
      updateConnectionStatus("checking");
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

        // Save the credential before activating the terminal.
        await credentials.savePairing(registration);

        processingCommandIds.current.clear();

        setPaired(true);
        setAccessDisabled(false);
        setMaintenanceMode(registration.maintenance_mode);

        onPairedChange?.(true);

        updateConnectionStatus("online");
        setStatus("active");
        setMessage("");

        return true;
      } catch (error) {
        if (isNetworkError(error)) {
          updateConnectionStatus("offline");
        } else {
          // An HTTP response means the server was reachable.
          updateConnectionStatus("online");
        }

        setMessage(errorMessage(error));
        setStatus("registration-error");

        return false;
      }
    },
    [
      deviceId,
      onPairedChange,
      updateConnectionStatus,
    ],
  );


  // --------------------------------------------------
  // Command acknowledgment
  // --------------------------------------------------


  const acknowledgeCommand = useCallback(
    async (
      commandId: number,
      commandStatus: "acknowledged" | "failed",
      resultMessage: string,
    ): Promise<boolean> => {
      try {
        await acknowledgeTerminalCommand(
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
    [
      acknowledgeCommand,
      synchronizeCatalog,
    ],
  );


  // --------------------------------------------------
  // Broadcast acknowledgment
  // --------------------------------------------------


  const dismissBroadcast = useCallback(() => {
    const currentBroadcast = broadcastQueue[0];

    if (!currentBroadcast || !paired) {
      return;
    }

    setBroadcastQueue((previous) =>
      previous.filter(
        (item) => item.id !== currentBroadcast.id,
      ),
    );

    void acknowledgeCommand(
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
    paired,
    acknowledgeCommand,
  ]);


  // --------------------------------------------------
  // Heartbeat and command polling
  // --------------------------------------------------


  useEffect(() => {
    if (!deviceId || !paired || status !== "active") {
      return;
    }

    let cancelled = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    let intervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS;
    let networkFailureCount = 0;

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
          getAppVersion(),
        );

        if (cancelled) return;

        if (response.session_token) {
          // Credential rotation (native). The previous credential stays
          // valid until this one is used, so a failed write is recoverable.
          try {
            await credentials.saveRotatedTerminalToken(
              response.session_token,
            );
          } catch (error) {
            console.warn(
              "[Terminal] Could not store the rotated credential:",
              errorMessage(error),
            );
          }
        }

        networkFailureCount = 0;

        intervalMs = Math.max(
          5_000,
          Math.min(
            DEFAULT_HEARTBEAT_INTERVAL_MS,
            response.heartbeat_interval_seconds * 1_000,
          ),
        );

        updateConnectionStatus("online");

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
            updateConnectionStatus("online");

            setAccessDisabled(true);
            setMaintenanceMode(false);

            setMessage(
              "This terminal has been disabled by an administrator.",
            );

            intervalMs = DISABLED_RETRY_INTERVAL_MS;
          } else if (isNetworkError(error)) {
            networkFailureCount += 1;

            updateConnectionStatus("offline");

            setMessage(errorMessage(error));

            intervalMs = getNetworkRetryDelay(
              networkFailureCount,
            );

            // Log only the transition to offline, not every retry.
            if (networkFailureCount === 1) {
              console.warn(
                "[Terminal] Kinesis host is unreachable. Retrying automatically.",
              );
            }
          } else {
            console.warn(
              "[Terminal] Heartbeat failed:",
              errorMessage(error),
            );

            intervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS;
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

    // Check immediately when the heartbeat effect starts.
    void sendHeartbeat();

    return () => {
      cancelled = true;
      clearTimer();
      appStateSubscription.remove();
    };
  }, [
    deviceId,
    paired,
    status,
    processCommands,
    clearInvalidTerminalSession,
    updateConnectionStatus,
  ]);


  return {
    status,
    connectionStatus,
    justReconnected,
    deviceId,
    message,
    accessDisabled,
    maintenanceMode,
    broadcastQueue,
    dismissBroadcast,
    pair,
  };
}
