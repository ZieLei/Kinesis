import { Platform } from "react-native";

/**
 * Server location and transport policy.
 *
 * Native apps are built with EXPO_PUBLIC_API_URL (for example
 * https://kinesis.local). The web build is served by the Kinesis host
 * itself, so when no URL is configured it talks to its own origin and
 * relative URLs are used.
 *
 * EXPO_PUBLIC_* values are inlined into the client bundle. Only the server
 * URL belongs here; never put secrets in EXPO_PUBLIC_* variables.
 */

function normalize(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "");
}

function resolveBaseUrl(): string {
  if (Platform.OS === "web") {
    // Production web builds are served by the Kinesis host together with
    // the API, so they use their own origin ("" = relative URLs) unless
    // EXPO_PUBLIC_WEB_API_URL says otherwise. EXPO_PUBLIC_API_URL (the
    // native apps' server address) only applies to the development server,
    // where Expo web on :8081 talks to the backend on another port.
    if (__DEV__) {
      return normalize(process.env.EXPO_PUBLIC_API_URL);
    }

    return normalize(process.env.EXPO_PUBLIC_WEB_API_URL);
  }

  return normalize(process.env.EXPO_PUBLIC_API_URL) || "http://127.0.0.1:8000";
}

export const API_BASE_URL = resolveBaseUrl();

/**
 * Development builds may use plain HTTP (Metro, local backends).
 * Release builds refuse to send credentials over an unencrypted connection.
 * This is deliberate: there is no silent fallback to HTTP.
 */
export const INSECURE_TRANSPORT_ERROR: string | null = (() => {
  if (__DEV__) {
    return null;
  }

  if (API_BASE_URL === "") {
    // Relative URLs inherit the page's scheme; the reverse proxy only
    // serves the application over HTTPS.
    return null;
  }

  if (/^https:\/\//i.test(API_BASE_URL)) {
    return null;
  }

  return (
    "This build is configured to reach the Kinesis server over an " +
    "unencrypted connection (" +
    API_BASE_URL +
    "). Release builds require an https:// server address."
  );
})();

/** Absolute WebSocket URL for an API path, wss:// whenever HTTPS is used. */
export function websocketUrl(path: string): string {
  let base = API_BASE_URL;

  if (base === "" && typeof window !== "undefined") {
    base = window.location.origin;
  }

  return (
    base
      .replace(/^https:/i, "wss:")
      .replace(/^http:/i, "ws:") + path
  );
}
