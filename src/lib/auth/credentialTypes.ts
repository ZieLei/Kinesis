/**
 * One credential interface, two platform implementations:
 *
 * - credentials.native.ts: terminal and cashier tokens live in the iOS
 *   Keychain / Android Keystore (expo-secure-store) and are sent as headers.
 * - credentials.web.ts: tokens are HttpOnly cookies set by the server and
 *   never readable by JavaScript. Only a CSRF token is held, in memory.
 *
 * Metro selects the implementation by file extension; callers import
 * "@/lib/auth/credentials" and never branch on the platform themselves.
 */

export type CredentialTransport = "keystore" | "cookie";

export type PairingCredentials = {
  session_token?: string;
  csrf_token?: string;
};

export type AuthorizeResult = {
  credentials?: RequestCredentials;
};

export interface CredentialStore {
  readonly transport: CredentialTransport;

  /**
   * Attach credentials to an API request. Mutates `headers`.
   * Headers supplied explicitly by the caller take precedence on native.
   */
  authorize(
    path: string,
    method: string,
    headers: Headers,
  ): Promise<AuthorizeResult>;

  /**
   * Whether this device is paired. Native reads the keystore; web asks the
   * server because the credential cookie is HttpOnly. Throws when the
   * secure store cannot be read.
   */
  loadTerminal(): Promise<boolean>;

  /** Persist the credential returned by a successful pairing. */
  savePairing(response: PairingCredentials): Promise<void>;

  /** Persist a rotated terminal credential offered by the heartbeat. */
  saveRotatedTerminalToken(token: string): Promise<void>;

  /** Forget the terminal credential (after the server rejected it). */
  clearTerminal(): Promise<void>;

  /**
   * Whether a cashier session may exist. Web cannot see its HttpOnly
   * cookie and always returns true; the server is the source of truth.
   */
  mayHaveCashierSession(): Promise<boolean>;

  /** Persist a new cashier session token (native). No-op on web. */
  saveCashierSession(token: string | undefined): Promise<void>;

  /** Forget the local cashier session. */
  clearCashier(): Promise<void>;

  /** Authenticate the settings WebSocket once it opens. */
  authenticateSocket(socket: WebSocket): Promise<void>;
}

export const TERMINAL_PAIR_PATH = "/api/terminals/pair";
export const CASHIER_LOGIN_PATH = "/api/cashier-auth/login";
export const TERMINAL_SESSION_PATH = "/api/terminals/session";

export function requestPath(path: string): string {
  return path.split("?")[0];
}

export function isUnsafeMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}
