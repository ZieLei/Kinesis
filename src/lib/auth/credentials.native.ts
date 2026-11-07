import * as SecureStore from "expo-secure-store";

import {
  CASHIER_LOGIN_PATH,
  TERMINAL_PAIR_PATH,
  requestPath,
  type CredentialStore,
} from "./credentialTypes";

/**
 * Native credential storage: iOS Keychain / Android Keystore.
 *
 * Key names are unchanged from earlier releases so existing installations
 * keep their pairing after upgrading.
 */

export const TERMINAL_SESSION_TOKEN_KEY = "kinesis-terminal-session-token";
export const CASHIER_SESSION_TOKEN_KEY = "kinesis-cashier-session-token";

// Credentials stay on this device: they are excluded from iCloud/iTunes
// backups and never migrate to a new phone. (Android Keystore keys are
// hardware-bound; app.json also disables Android auto-backup.)
const WRITE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.error("[Credentials] Could not read secure storage:", error);

    throw new Error(
      "Could not access terminal credentials in secure storage.",
    );
  }
}

async function write(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value, WRITE_OPTIONS);
}

async function remove(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

export const credentials: CredentialStore = {
  transport: "keystore",

  async authorize(path, _method, headers) {
    const route = requestPath(path);

    // Pairing does not use an existing terminal credential.
    if (route !== TERMINAL_PAIR_PATH && !headers.has("Authorization")) {
      const terminalToken = await read(TERMINAL_SESSION_TOKEN_KEY);

      if (terminalToken) {
        headers.set("Authorization", `Bearer ${terminalToken}`);
      }
    }

    // PIN login does not require an existing cashier session.
    if (route !== CASHIER_LOGIN_PATH && !headers.has("X-Cashier-Session")) {
      const cashierToken = await read(CASHIER_SESSION_TOKEN_KEY);

      if (cashierToken) {
        headers.set("X-Cashier-Session", cashierToken);
      }
    }

    return {};
  },

  async loadTerminal() {
    return (await read(TERMINAL_SESSION_TOKEN_KEY)) !== null;
  },

  async savePairing(response) {
    if (!response.session_token) {
      throw new Error("The server did not return a terminal credential.");
    }

    await write(TERMINAL_SESSION_TOKEN_KEY, response.session_token);
  },

  async saveRotatedTerminalToken(token) {
    // If this write fails the previous credential stays valid until the
    // new one is used, so the terminal is not locked out.
    await write(TERMINAL_SESSION_TOKEN_KEY, token);
  },

  async clearTerminal() {
    await remove(CASHIER_SESSION_TOKEN_KEY);
    await remove(TERMINAL_SESSION_TOKEN_KEY);
  },

  async mayHaveCashierSession() {
    return (await read(CASHIER_SESSION_TOKEN_KEY)) !== null;
  },

  async saveCashierSession(token) {
    if (!token) {
      throw new Error("The server did not return a cashier session.");
    }

    await write(CASHIER_SESSION_TOKEN_KEY, token);
  },

  async clearCashier() {
    await remove(CASHIER_SESSION_TOKEN_KEY);
  },

  async authenticateSocket(socket) {
    const token = await read(TERMINAL_SESSION_TOKEN_KEY);

    if (token && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "authenticate",
          session_token: token,
        }),
      );
    }
  },
};
