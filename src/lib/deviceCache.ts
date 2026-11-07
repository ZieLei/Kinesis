/**
 * Type-checking entry point. Metro resolves deviceCache.native.ts or
 * deviceCache.web.ts at runtime.
 *
 * The device cache holds NON-SECRET data only (device identifier, cached
 * POS settings). Credentials belong in "@/lib/auth/credentials".
 */

export { deviceCache } from "./deviceCache.native";
export type { DeviceCache } from "./deviceCache.native";
