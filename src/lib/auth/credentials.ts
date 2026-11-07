/**
 * Type-checking entry point. At runtime Metro resolves
 * "@/lib/auth/credentials" to credentials.native.ts on iOS/Android and to
 * credentials.web.ts in browsers; both implement CredentialStore.
 */

export { credentials } from "./credentials.native";
export type { CredentialStore } from "./credentialTypes";
