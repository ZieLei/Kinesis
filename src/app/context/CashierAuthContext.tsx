import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  router,
  usePathname,
} from "expo-router";

import {
  ApiError,
  apiRequest,
  isNetworkError,
  setTerminalLockedHandler,
} from "@/lib/api";
import { credentials } from "@/lib/auth/credentials";


export type CashierAccount = {
  id: string;
  username: string;
  display_name: string;
  /** Supervisors can edit and archive services. The server enforces it. */
  is_supervisor?: boolean;
};


type CashierLoginResponse = {
  authenticated: boolean;
  cashier: CashierAccount;
  // Native only. Browser terminals receive an HttpOnly cookie instead.
  session_token?: string;
  idle_expires_at: string;
  absolute_expires_at: string;
};


type CashierSessionResponse = {
  authenticated: boolean;
  /** The server's verdict: a locked terminal stays locked across reloads. */
  locked?: boolean;
  cashier: CashierAccount;
  terminal_id: number;
  idle_expires_at: string;
  absolute_expires_at: string;
};


export type CashierAuthStatus =
  | "terminal-unavailable"
  | "loading"
  | "unauthenticated"
  | "authenticated"
  | "unavailable";


type CashierAuthContextValue = {
  status: CashierAuthStatus;
  cashier: CashierAccount | null;
  error: string | null;
  /** True while the terminal is locked (decided by the server). */
  locked: boolean;
  /** Lock now: shows the lock screen and tells the server. */
  lockTerminal: () => void;
  /** Mark the terminal unlocked after the PIN was verified. */
  unlockTerminal: () => void;
  /** The server said it is locked (activity reply or a refused request). */
  markLocked: () => void;
  login: (username: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};


const CashierAuthContext =
  createContext<CashierAuthContextValue | null>(null);


function getErrorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return (
      "Cannot reach the Kinesis server. Connect this terminal " +
      "to the shop's Wi-Fi and check that the host computer is running."
    );
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Cashier authentication failed.";
}


type CashierAuthProviderProps = {
  terminalPaired: boolean;
  children: ReactNode;
};


export function CashierAuthProvider({
  terminalPaired,
  children,
}: CashierAuthProviderProps) {
  const [status, setStatus] =
    useState<CashierAuthStatus>("loading");

  const [cashier, setCashier] =
    useState<CashierAccount | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [locked, setLocked] = useState(false);


  // --------------------------------------------------
  // Restore an existing cashier session
  // --------------------------------------------------


  const refreshSession = useCallback(async () => {
    if (!terminalPaired) {
      setStatus("terminal-unavailable");
      setCashier(null);
      setError(null);

      return;
    }

    setStatus("loading");
    setError(null);

    try {
      if (!(await credentials.mayHaveCashierSession())) {
        setCashier(null);
        setStatus("unauthenticated");

        return;
      }

      const response = await apiRequest<CashierSessionResponse>(
        "/api/cashier-auth/session",
      );

      // Before the status changes, so a reload of a locked terminal never
      // shows the app unlocked, not even for a frame.
      setLocked(response.locked === true);
      setCashier(response.cashier);
      setStatus("authenticated");
      setError(null);
    } catch (requestError) {
      if (
        requestError instanceof ApiError &&
        [401, 403].includes(requestError.status)
      ) {
        // The server explicitly rejected the saved cashier token.
        // This is an expired/invalid session, not a network outage.
        try {
          await credentials.clearCashier();
        } catch (storageError) {
          console.error(
            "[Cashier Auth] Could not clear expired credentials:",
            storageError,
          );
        }

        setCashier(null);
        setStatus("unauthenticated");
        setError(null);

        return;
      }

      setError(getErrorMessage(requestError));
      setStatus("unavailable");

      // Keep the saved token locally. The server could not be
      // reached, so we cannot conclude that the session expired.
    }
  }, [terminalPaired]);


  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);


  // --------------------------------------------------
  // Authenticate a cashier
  // --------------------------------------------------


  const login = useCallback(
    async (username: string, pin: string) => {
      if (!terminalPaired) {
        const unavailableError = new Error(
          "This terminal is not connected to the Kinesis server. Check the shop Wi-Fi and try again.",
        );

        setError(unavailableError.message);

        throw unavailableError;
      }

      setStatus("loading");
      setError(null);

      try {
        const response = await apiRequest<CashierLoginResponse>(
          "/api/cashier-auth/login",
          {
            method: "POST",
            body: JSON.stringify({
              username,
              pin,
            }),
          },
        );

        try {
          await credentials.saveCashierSession(response.session_token);
        } catch (storageError) {
          // Do not leave a server session active if its credential
          // cannot be stored securely on this device.
          try {
            await apiRequest(
              "/api/cashier-auth/logout",
              {
                method: "POST",
                headers: response.session_token
                  ? { "X-Cashier-Session": response.session_token }
                  : undefined,
              },
            );
          } catch (logoutError) {
            console.error(
              "[Cashier Auth] Could not revoke session after storage failure:",
              logoutError,
            );
          }

          throw new Error(
            "The cashier session could not be saved securely on this device.",
          );
        }

        setLocked(false);
        setCashier(response.cashier);
        setStatus("authenticated");
        setError(null);
      } catch (loginError) {
        const message = getErrorMessage(loginError);

        setError(message);
        setStatus("unauthenticated");
        setCashier(null);

        throw loginError;
      }
    },
    [terminalPaired],
  );


  // --------------------------------------------------
  // End the cashier session
  // --------------------------------------------------


  const logout = useCallback(async () => {
    try {
      // The server revokes the session; on web it also clears the cookie.
      if (terminalPaired && (await credentials.mayHaveCashierSession())) {
        await apiRequest(
          "/api/cashier-auth/logout",
          {
            method: "POST",
          },
        );
      }
    } catch (logoutError) {
      // End the local session even when the server is unavailable.
      // The server-side session will expire according to its configured
      // idle and absolute expiration limits.
      console.warn(
        "[Cashier Auth] Server-side logout could not be confirmed:",
        getErrorMessage(logoutError),
      );
    } finally {
      try {
        await credentials.clearCashier();
      } catch (storageError) {
        console.error(
          "[Cashier Auth] Could not remove the local cashier session:",
          storageError,
        );
      }

      setLocked(false);
      setCashier(null);
      setStatus("unauthenticated");
      setError(null);
    }
  }, [terminalPaired]);


  // --------------------------------------------------
  // Terminal lock
  // --------------------------------------------------


  const markLocked = useCallback(() => setLocked(true), []);

  const unlockTerminal = useCallback(() => setLocked(false), []);

  const lockTerminal = useCallback(() => {
    setLocked(true);

    // Best effort: if this fails (offline), the server still locks the
    // session by itself once the inactivity period has passed.
    void apiRequest("/api/cashier-auth/lock", { method: "POST" }).catch(
      () => undefined,
    );
  }, []);

  // Any request the server refuses because the terminal is locked also
  // brings up the lock screen.
  useEffect(() => {
    setTerminalLockedHandler(markLocked);

    return () => setTerminalLockedHandler(null);
  }, [markLocked]);


  // --------------------------------------------------
  // Context value
  // --------------------------------------------------


  const value = useMemo<CashierAuthContextValue>(
    () => ({
      status,
      cashier,
      error,
      locked,
      lockTerminal,
      unlockTerminal,
      markLocked,
      login,
      logout,
      refreshSession,
    }),
    [
      status,
      cashier,
      error,
      locked,
      lockTerminal,
      unlockTerminal,
      markLocked,
      login,
      logout,
      refreshSession,
    ],
  );


  return (
    <CashierAuthContext.Provider value={value}>
      {children}
    </CashierAuthContext.Provider>
  );
}


export function useCashierAuth() {
  const context = useContext(CashierAuthContext);

  if (!context) {
    throw new Error(
      "useCashierAuth must be used inside CashierAuthProvider.",
    );
  }

  return context;
}


/**
 * Globally protects POS routes while leaving the landing page,
 * cashier login screen, and feature exploration accessible.
 *
 * The navigator (`children`) is ALWAYS rendered. Swapping it out for a
 * <Redirect> or a spinner unmounts the root stack, which throws away the
 * whole back history and, on web, loops: the remounted stack re-derives
 * the URL, the guard redirects again, and React aborts with "Maximum
 * update depth exceeded". Instead, redirects happen imperatively from an
 * effect and the waiting/error UI is drawn as a cover over the stack.
 */
export function CashierRouteGuard({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  const {
    status,
    error,
    refreshSession,
  } = useCashierAuth();

  const publicRoutes = [
    "/",
    "/login",
    "/explore",
  ];

  const isPublicRoute = publicRoutes.includes(pathname);

  // Signed-in history and signed-out history never mix: crossing the auth
  // boundary clears the stack so back cannot return to the other side
  // (no back from Home into login, no back from login into POS screens).
  const signedInOnLogin =
    pathname === "/login" && status === "authenticated";
  const signedOutOnPos =
    !isPublicRoute && status === "unauthenticated";

  useEffect(() => {
    if (!signedInOnLogin && !signedOutOnPos) return;

    if (router.canDismiss()) router.dismissAll();
    router.replace(signedInOnLogin ? "/dashboard" : "/login");
  }, [signedInOnLogin, signedOutOnPos]);

  let cover: ReactNode = null;

  if (!isPublicRoute) {
    if (status === "unavailable") {
      cover = (
        <View className="flex-1 items-center justify-center bg-ctp-base px-6">
          <View className="w-full max-w-sm rounded-2xl border border-ctp-surface0 bg-ctp-mantle p-5">
            <Text className="font-line-seed text-lg font-bold text-ctp-text">
              Cannot verify your session
            </Text>

            <Text className="mt-2 font-line-seed text-sm leading-6 text-ctp-subtext0">
              Kinesis could not contact the server to verify your
              cashier session. Reconnect to the store network and
              try again.
            </Text>

            {!!error && (
              <Text className="mt-3 font-line-seed text-xs leading-5 text-ctp-red">
                {error}
              </Text>
            )}

            <Pressable
              onPress={() => void refreshSession()}
              className="mt-5 min-h-12 items-center justify-center rounded-lg bg-ctp-blue"
            >
              <Text className="font-line-seed text-sm font-bold text-ctp-crust">
                Retry connection
              </Text>
            </Pressable>
          </View>
        </View>
      );
    } else if (status !== "authenticated") {
      // Verifying, terminal not ready yet, or about to redirect to login.
      cover = (
        <View className="flex-1 items-center justify-center bg-ctp-base px-6">
          <ActivityIndicator
            size="large"
            color="#89b4fa"
          />

          <Text className="mt-4 font-line-seed text-sm text-ctp-subtext0">
            Verifying your Kinesis session...
          </Text>
        </View>
      );
    }
  }

  return (
    <>
      {children}

      {cover ? (
        <View style={guardStyles.cover}>{cover}</View>
      ) : null}
    </>
  );
}

const guardStyles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFill,
    zIndex: 900,
    elevation: 900,
  },
});
