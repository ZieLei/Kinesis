
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
  ApiError,
  setApiCsrfToken,
  setApiUnauthorizedHandler,
} from "../lib/api";

import {
  fetchAdminSession,
  loginAdmin,
  logoutAdmin,
} from "../lib/authApi";

import type {
  AdminUser,
  AdminSessionResponse,
  AdminLoginRequest,
} from "../lib/authApi";


export type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "unavailable";


type AuthContextValue = {
  status: AuthStatus;
  user: AdminUser | null;
  error: string | null;

  login: (
    credentials: AdminLoginRequest,
  ) => Promise<void>;

  logout: () => Promise<void>;

  refreshSession: () => Promise<void>;
};


const AuthContext = createContext<AuthContextValue | null>(
  null,
);


type AuthProviderProps = {
  children: ReactNode;
};


export function AuthProvider({
  children,
}: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>(
    "loading",
  );

  const [user, setUser] = useState<AdminUser | null>(
    null,
  );

  const [error, setError] = useState<string | null>(
    null,
  );


  // --------------------------------------------------
  // Apply an authenticated session
  // --------------------------------------------------

  const applySession = useCallback(
    (session: AdminSessionResponse) => {
      setApiCsrfToken(
        session.csrf_token,
      );

      setUser(session.user);

      setError(null);

      setStatus("authenticated");
    },
    [],
  );


  // --------------------------------------------------
  // Clear the local authentication state
  // --------------------------------------------------

  const clearSession = useCallback(() => {
    setApiCsrfToken(null);

    setUser(null);

    setError(null);

    setStatus("unauthenticated");
  }, []);


  // --------------------------------------------------
  // Respond to expired or revoked sessions
  // --------------------------------------------------

  useEffect(() => {
    setApiUnauthorizedHandler(
      clearSession,
    );

    return () => {
      setApiUnauthorizedHandler(null);
    };
  }, [clearSession]);


  // --------------------------------------------------
  // Restore the existing browser session
  // --------------------------------------------------

  const loadSession = useCallback(
    async (signal?: AbortSignal) => {
      setStatus("loading");

      setError(null);

      try {
        const session = await fetchAdminSession(
          signal,
        );

        if (signal?.aborted) return;

        applySession(session);
      } catch (requestError) {
        if (signal?.aborted) return;

        setApiCsrfToken(null);

        setUser(null);

        if (
          requestError instanceof ApiError &&
          requestError.status === 401
        ) {
          setStatus("unauthenticated");

          setError(null);

          return;
        }

        setStatus("unavailable");

        setError(
          requestError instanceof Error
            ? requestError.message
            : "The administrator session could not be restored.",
        );
      }
    },
    [applySession],
  );


  // --------------------------------------------------
  // Initialize authentication on application startup
  // --------------------------------------------------

  useEffect(() => {
    const controller = new AbortController();

    void loadSession(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadSession]);


  // --------------------------------------------------
  // Manually restore session
  // --------------------------------------------------

  const refreshSession = useCallback(
    async () => {
      await loadSession();
    },
    [loadSession],
  );


  // --------------------------------------------------
  // Login
  // --------------------------------------------------

  const login = useCallback(
    async (
      credentials: AdminLoginRequest,
    ) => {
      setError(null);

      setApiCsrfToken(null);

      try {
        const session = await loginAdmin(
          credentials,
        );

        applySession(session);
      } catch (requestError) {
        setApiCsrfToken(null);

        setUser(null);

        setStatus("unauthenticated");

        throw requestError;
      }
    },
    [applySession],
  );


  // --------------------------------------------------
  // Logout
  // --------------------------------------------------

  const logout = useCallback(
    async () => {
      try {
        await logoutAdmin();

        clearSession();
      } catch (requestError) {
        if (
          requestError instanceof ApiError &&
          requestError.status === 401
        ) {
          clearSession();

          return;
        }

        throw requestError;
      }
    },
    [clearSession],
  );


  // --------------------------------------------------
  // Context
  // --------------------------------------------------

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      error,
      login,
      logout,
      refreshSession,
    }),
    [
      status,
      user,
      error,
      login,
      logout,
      refreshSession,
    ],
  );


  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}


// --------------------------------------------------
// Authentication hook
// --------------------------------------------------

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used inside an AuthProvider.",
    );
  }

  return context;
}
