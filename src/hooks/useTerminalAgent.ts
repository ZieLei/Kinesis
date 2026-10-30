import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";

import {
  registerTerminal,
  sendTerminalHeartbeat,
} from "@/lib/terminalAgentApi";

const DEVICE_ID_KEY = "kinesis-terminal-device-id";
const SESSION_TOKEN_KEY = "kinesis-terminal-session-token";
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

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
    : "An unexpected terminal registration error occurred.";
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
  const [status, setStatus] =
    useState<TerminalAgentStatus>("initializing");

  const [deviceId, setDeviceId] = useState("");
  const [message, setMessage] = useState("");
  const [sessionToken, setSessionToken] = useState<string | null>(null);

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

  const enroll = useCallback(
    async (enrollmentKey: string) => {
      if (!deviceId) {
        setMessage("The device identity is not ready. Restart the app.");
        setStatus("registration-error");
        return;
      }

      const key = enrollmentKey.trim();

      if (!key) {
        setMessage("Enter the terminal enrollment key.");
        setStatus("registration-error");
        return;
      }

      setMessage("");
      setStatus("registering");

      try {
        const registration = await registerTerminal(
          {
            device_id: deviceId,
            name: getDeviceName(),
            device_type: getDeviceType(),
            platform: getPlatformName(),
            app_version: getAppVersion(),
          },
          key,
        );

        await SecureStore.setItemAsync(
          SESSION_TOKEN_KEY,
          registration.session_token,
        );

        setSessionToken(registration.session_token);
        onSessionTokenChange?.(registration.session_token);

        setStatus("active");
        setMessage("");
      } catch (error) {
        setMessage(errorMessage(error));
        setStatus("registration-error");
      }
    },
    [deviceId, onSessionTokenChange],
  );

  useEffect(() => {
    if (!deviceId || !sessionToken || status !== "active") {
      return;
    }

    const activeSessionToken: string = sessionToken;

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

        intervalMs = Math.max(
          5_000,
          Math.min(
            30_000,
            response.heartbeat_interval_seconds * 1_000,
          ),
        );

        if (!response.is_enabled) {
          console.warn(
            "[Terminal] The server reports this device as disabled.",
          );
        }

        if (response.maintenance_mode) {
          console.info(
            "[Terminal] Maintenance mode is enabled on the server.",
          );
        }

        // Pending command handling will be connected separately.
      } catch (error) {
        if (!cancelled) {
          console.warn(
            "[Terminal] Heartbeat failed:",
            errorMessage(error),
          );
        }
      } finally {
        running = false;
        scheduleNextHeartbeat();
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
  }, [deviceId, sessionToken, status]);

  return {
    status,
    deviceId,
    message,
    enroll,
  };
}
