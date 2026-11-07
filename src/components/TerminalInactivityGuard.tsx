
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { usePathname } from "expo-router";

import LockKeyhole from "lucide-react-native/icons/lock-keyhole";
import LogOut from "lucide-react-native/icons/log-out";

import { useCashierAuth } from "@/app/context/CashierAuthContext";
import { useTerminalSettings } from "@/app/context/TerminalSettingsContext";
import { ApiError, apiRequest } from "@/lib/api";
import { credentials } from "@/lib/auth/credentials";

const HEARTBEAT_INTERVAL_MS = 60_000;
const DEFAULT_LOCK_MINUTES = 5;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 10000,
    elevation: 10000,
    alignItems: "center",
    justifyContent: "center",
  },
});

function getLockDuration(value: string | undefined): number {
  if (value === "disabled") {
    return 0;
  }

  const minutes = Number(value ?? DEFAULT_LOCK_MINUTES);

  if (![5, 10, 15, 30, 60].includes(minutes)) {
    return DEFAULT_LOCK_MINUTES * 60_000;
  }

  return minutes * 60_000;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The terminal could not be unlocked. Please try again.";
}

export default function TerminalInactivityGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const {
    status: authStatus,
    cashier,
    logout,
  } = useCashierAuth();

  const { settings } = useTerminalSettings();

  const publicRoutes = [
    "/",
    "/login",
    "/explore",
  ];

  const isPublicRoute = publicRoutes.includes(pathname);

  const lockDuration = getLockDuration(
    settings?.inactivityLock,
  );

  const lastActivityAt = useRef(Date.now());
  const lastHeartbeatAt = useRef(0);
  const lockedRef = useRef(false);

  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);

  // --------------------------------------------------
  // Reset local lock state when cashier authentication changes
  // --------------------------------------------------

  useEffect(() => {
    lastActivityAt.current = Date.now();
    lastHeartbeatAt.current = 0;

    setLocked(false);
    setPin("");
    setError("");
  }, [authStatus]);

  // --------------------------------------------------
  // Record user activity
  // --------------------------------------------------

  const recordActivity = useCallback(() => {
    if (
      authStatus !== "authenticated" ||
      isPublicRoute ||
      lockedRef.current
    ) {
      return;
    }

    const now = Date.now();

    lastActivityAt.current = now;

    // Refresh the server-side session while the cashier is actively
    // using the terminal. This prevents a long-running active session
    // from expiring merely because the current screen made few API calls.
    if (
      now - lastHeartbeatAt.current >= HEARTBEAT_INTERVAL_MS
    ) {
      lastHeartbeatAt.current = now;

      void apiRequest(
        "/api/cashier-auth/session",
        {
          method: "GET",
          cache: "no-store",
        },
      ).catch(() => {
        // Normal screen requests and session verification will report
        // authentication or connectivity failures to the user.
      });
    }
  }, [
    authStatus,
    isPublicRoute,
  ]);

  // --------------------------------------------------
  // Enforce the configured inactivity timeout
  // --------------------------------------------------

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      isPublicRoute ||
      locked ||
      lockDuration === 0
    ) {
      return;
    }

    const interval = setInterval(() => {
      if (
        Date.now() - lastActivityAt.current >= lockDuration
      ) {
        setPin("");
        setError("");
        setLocked(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [
    authStatus,
    isPublicRoute,
    locked,
    lockDuration,
  ]);

  // --------------------------------------------------
  // Handle returning from the background
  // --------------------------------------------------

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (
          nextState !== "active" ||
          authStatus !== "authenticated" ||
          isPublicRoute ||
          lockedRef.current ||
          lockDuration === 0
        ) {
          return;
        }

        if (
          Date.now() - lastActivityAt.current >= lockDuration
        ) {
          setPin("");
          setError("");
          setLocked(true);
        }
      },
    );

    return () => subscription.remove();
  }, [
    authStatus,
    isPublicRoute,
    lockDuration,
  ]);

  // --------------------------------------------------
  // Unlock with the current cashier PIN
  // --------------------------------------------------

  const handleUnlock = async () => {
    if (verifying || !/^\d{6}$/.test(pin)) {
      return;
    }

    setVerifying(true);
    setError("");

    try {
      const response = await apiRequest<{
        verified: boolean;
        // Re-authentication rotates the cashier session (native only;
        // browser terminals receive a new HttpOnly cookie).
        session_token?: string;
        cashier: {
          id: string;
          username: string;
          display_name: string;
        };
      }>("/api/cashier-auth/verify-pin", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });

      if (!response.verified) {
        throw new Error("PIN verification was unsuccessful.");
      }

      if (credentials.transport === "keystore") {
        try {
          await credentials.saveCashierSession(response.session_token);
        } catch {
          // The previous session was revoked by the server, so a session
          // that cannot be stored means signing in again.
          setError(
            "Your session could not be saved securely. Please sign in again.",
          );

          await logout();
          return;
        }
      }

      lastActivityAt.current = Date.now();
      lastHeartbeatAt.current = Date.now();

      setPin("");
      setError("");
      setLocked(false);
    } catch (requestError) {
      // A wrong PIN must not sign the cashier out.
      // An expired/revoked session is different and requires a new login.
      if (
        requestError instanceof ApiError &&
        requestError.status === 401 &&
        requestError.message !== "Invalid username or PIN."
      ) {
        setError("Your cashier session has expired. Please sign in again.");

        await logout();
        return;
      }

      setPin("");
      setError(getErrorMessage(requestError));
    } finally {
      setVerifying(false);
    }
  };

  const handleSignOut = async () => {
    if (verifying) return;

    await logout();
  };

  return (
    <View
      className="flex-1"
      onTouchStart={recordActivity}
      onTouchMove={recordActivity}
      onTouchEnd={recordActivity}
    >
      {children}

      {locked && authStatus === "authenticated" && !isPublicRoute ? (
        <View
          style={styles.overlay}
          className="bg-ctp-base px-6"
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            className="w-full max-w-md"
          >
            <View className="items-center">
              <View className="h-20 w-20 items-center justify-center rounded-2xl border border-ctp-surface1 bg-ctp-mantle">
                <LockKeyhole size={35} color="#89B4FA" />
              </View>

              <Text className="mt-6 font-fredoka text-2xl text-ctp-text">
                Kinesis is locked
              </Text>

              <Text className="mt-2 text-center font-inter-regular text-sm leading-6 text-ctp-subtext0">
                This terminal was locked after a period of inactivity.
                Enter your PIN to resume your session.
              </Text>

              <View className="mt-7 w-full rounded-xl border border-ctp-surface0 bg-ctp-mantle p-4">
                <Text className="text-center font-inter-semibold text-base text-ctp-text">
                  {cashier?.display_name ?? "Cashier"}
                </Text>

                <Text className="mt-1 text-center font-inter-regular text-xs text-ctp-subtext0">
                  @{cashier?.username ?? "cashier"}
                </Text>

                <Text className="mb-3 mt-6 text-center font-inter-medium text-sm text-ctp-subtext1">
                  Enter your six-digit PIN
                </Text>

                <TextInput
                  value={pin}
                  onChangeText={(value) => {
                    setPin(
                      value.replace(/\D/g, "").slice(0, 6),
                    );
                    setError("");
                  }}
                  editable={!verifying}
                  autoFocus
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={6}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="••••••"
                  placeholderTextColor="#6C7086"
                  selectionColor="#89B4FA"
                  accessibilityLabel="Cashier unlock PIN"
                  onSubmitEditing={() => void handleUnlock()}
                  returnKeyType="go"
                  className="min-h-16 rounded-xl border border-ctp-surface1 bg-ctp-base px-5 text-center font-inter-regular text-2xl tracking-[12px] text-ctp-text"
                />

                {error ? (
                  <Text
                    accessibilityRole="alert"
                    className="mt-3 text-center font-inter-medium text-xs leading-5 text-ctp-red"
                  >
                    {error}
                  </Text>
                ) : null}

                <Pressable
                  onPress={() => void handleUnlock()}
                  disabled={verifying || pin.length !== 6}
                  className={`mt-5 min-h-12 flex-row items-center justify-center gap-2 rounded-lg ${verifying || pin.length !== 6
                    ? "bg-ctp-blue/40"
                    : "bg-ctp-blue"
                    }`}
                >
                  {verifying ? (
                    <ActivityIndicator
                      size="small"
                      color="#1E1E2E"
                    />
                  ) : null}

                  <Text className="font-inter-bold text-sm text-ctp-crust">
                    {verifying ? "Verifying..." : "Unlock terminal"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => void handleSignOut()}
                  disabled={verifying}
                  className="mt-4 min-h-10 flex-row items-center justify-center gap-2"
                >
                  <LogOut size={15} color="#A6ADC8" />

                  <Text className="font-inter-medium text-xs text-ctp-subtext0">
                    Sign out instead
                  </Text>
                </Pressable>
              </View>

              <Text className="mt-6 text-center font-inter-regular text-[11px] text-ctp-overlay1">
                Your cart and unfinished sale are preserved.
              </Text>
            </View>
          </KeyboardAvoidingView>
        </View>
      ) : null}
    </View>
  );
}
