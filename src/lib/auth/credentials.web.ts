import { API_BASE_URL } from "@/lib/config";

import {
  TERMINAL_PAIR_PATH,
  TERMINAL_SESSION_PATH,
  isUnsafeMethod,
  requestPath,
  type CredentialStore,
} from "./credentialTypes";

/**
 * Browser credential handling.
 *
 * Terminal and cashier credentials are HttpOnly, Secure, SameSite=Strict
 * cookies issued by the server. JavaScript, including any injected script,
 * cannot read them, and nothing secret is written to localStorage,
 * sessionStorage or IndexedDB.
 *
 * State-changing requests carry an X-CSRF-Token derived by the server
 * from the terminal pairing. It is kept in memory only and re-fetched from
 * /api/terminals/session after a reload.
 */

// A non-secret hint so an offline reload can show the POS instead of the
// pairing screen. It grants nothing: every request is authorized by the
// cookie, and the server rejects a missing or revoked credential.
const PAIRED_HINT_KEY = "kinesis-terminal-paired";

let csrfToken: string | null = null;
let csrfRequest: Promise<string | null> | null = null;

function setPairedHint(paired: boolean) {
  try {
    if (paired) {
      window.localStorage.setItem(PAIRED_HINT_KEY, "1");
    } else {
      window.localStorage.removeItem(PAIRED_HINT_KEY);
    }
  } catch {
    // Storage can be disabled (private browsing). The hint is optional.
  }
}

function getPairedHint(): boolean {
  try {
    return window.localStorage.getItem(PAIRED_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

type SessionResult =
  | { state: "paired"; csrf: string | null }
  | { state: "unpaired" }
  | { state: "disabled" };

async function fetchSession(): Promise<SessionResult> {
  const response = await fetch(`${API_BASE_URL}${TERMINAL_SESSION_PATH}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (response.status === 401) {
    return { state: "unpaired" };
  }

  if (response.status === 403) {
    return { state: "disabled" };
  }

  if (!response.ok) {
    throw new Error(`Terminal session check failed (${response.status}).`);
  }

  const body = (await response.json()) as { csrf_token?: string | null };

  return { state: "paired", csrf: body.csrf_token ?? null };
}

async function ensureCsrfToken(): Promise<string | null> {
  if (csrfToken) {
    return csrfToken;
  }

  csrfRequest ??= fetchSession()
    .then((result) => {
      csrfToken = result.state === "paired" ? result.csrf : null;
      return csrfToken;
    })
    .catch(() => null)
    .finally(() => {
      csrfRequest = null;
    });

  return csrfRequest;
}

export const credentials: CredentialStore = {
  transport: "cookie",

  async authorize(path, method, headers) {
    const route = requestPath(path);

    // Browser clients never hold raw tokens; drop any a caller supplied.
    headers.delete("Authorization");
    headers.delete("X-Cashier-Session");

    if (route === TERMINAL_PAIR_PATH) {
      // Ask the server to issue the credential as an HttpOnly cookie.
      headers.set("X-Kinesis-Client", "web");
    } else if (isUnsafeMethod(method)) {
      const token = await ensureCsrfToken();

      if (token) {
        headers.set("X-CSRF-Token", token);
      }
    }

    // "include" is needed for cross-origin development servers; in
    // production the app and API share one origin.
    return { credentials: "include" };
  },

  async loadTerminal() {
    try {
      const result = await fetchSession();

      if (result.state === "unpaired") {
        csrfToken = null;
        setPairedHint(false);
        return false;
      }

      if (result.state === "paired") {
        csrfToken = result.csrf;
      }

      setPairedHint(true);
      return true;
    } catch {
      // Server unreachable: trust the hint until the heartbeat can verify.
      return getPairedHint();
    }
  },

  async savePairing(response) {
    if (response.session_token) {
      // The server must never send a raw credential to a browser client.
      throw new Error(
        "The server returned a bearer token to a browser terminal. " +
          "Pairing was refused; check the server version.",
      );
    }

    csrfToken = response.csrf_token ?? null;
    setPairedHint(true);
  },

  async saveRotatedTerminalToken() {
    // Rotation replaces the HttpOnly cookie server-side.
  },

  async clearTerminal() {
    // The cookie is HttpOnly; the server has already revoked it.
    csrfToken = null;
    setPairedHint(false);
  },

  async mayHaveCashierSession() {
    return true;
  },

  async saveCashierSession() {
    // Issued as an HttpOnly cookie by the server.
  },

  async clearCashier() {
    // Cleared by the server on logout; nothing is stored in JavaScript.
  },

  async authenticateSocket() {
    // The cookie authenticates the WebSocket handshake.
  },
};
