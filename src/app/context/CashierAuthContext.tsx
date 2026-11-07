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
  Text,
  View,
} from "react-native";

import {
  Redirect,
  usePathname,
} from "expo-router";

import {
  ApiError,
  apiRequest,
  isNetworkError,
} from "@/lib/api";
import { credentials } from "@/lib/auth/credentials";


export type CashierAccount = {
  id: string;
  username: string;
  display_name: string;
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

      setCashier(null);
      setStatus("unauthenticated");
      setError(null);
    }
  }, [terminalPaired]);


  // --------------------------------------------------
  // Context value
  // --------------------------------------------------


  const value = useMemo<CashierAuthContextValue>(
    () => ({
      status,
      cashier,
      error,
      login,
      logout,
      refreshSession,
    }),
    [
      status,
      cashier,
      error,
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


  if (pathname === "/login" && status === "authenticated") {
    return <Redirect href="/dashboard" />;
  }

  if (isPublicRoute) {
    return <>{children}</>;
  }


  if (
    status === "terminal-unavailable" ||
    status === "loading"
  ) {
    return (
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


  if (status === "unavailable") {
    return (
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
  }


  if (status !== "authenticated") {
    return <Redirect href="/login" />;
  }

  return <>{children}</>;
}
