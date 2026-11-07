import type { DeviceCache } from "./deviceCache.native";

/**
 * Web: localStorage, used ONLY for non-secret data (device identifier,
 * cached POS display settings). Anything stored here is readable by any
 * script on the origin, which is why credentials are never stored here.
 */
export const deviceCache: DeviceCache = {
  async getItem(key) {
    if (typeof window === "undefined") return null;

    return window.localStorage.getItem(key);
  },

  async setItem(key, value) {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(key, value);
  },

  async removeItem(key) {
    if (typeof window === "undefined") return;

    window.localStorage.removeItem(key);
  },
};
