import { deviceCache } from "@/lib/deviceCache";

export type ThemePreference = "light" | "dark";

// Not a secret: the cashier's last light/dark choice on this device.
const THEME_KEY = "kinesis.theme";

export async function loadThemePreference(): Promise<ThemePreference | null> {
  try {
    const stored = await deviceCache.getItem(THEME_KEY);

    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    // Storage unavailable (private browsing): fall back to the default.
    return null;
  }
}

export async function saveThemePreference(
  theme: ThemePreference,
): Promise<void> {
  try {
    await deviceCache.setItem(THEME_KEY, theme);
  } catch {
    // The theme still changes for this session.
  }
}
