import * as SecureStore from "expo-secure-store";

export type DeviceCache = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/**
 * Native: unchanged from earlier releases (expo-secure-store, same keys),
 * so existing installations keep their device identity and cached settings.
 * Items are bound to this device and excluded from backups.
 */
export const deviceCache: DeviceCache = {
  getItem(key) {
    return SecureStore.getItemAsync(key);
  },

  setItem(key, value) {
    return SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  removeItem(key) {
    return SecureStore.deleteItemAsync(key);
  },
};
