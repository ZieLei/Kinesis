

import { apiRequest } from "./api";

export type AdminUser = {
  username: string;
};

export type AdminSessionResponse = {
  authenticated: true;
  user: AdminUser;
  csrf_token: string;
  idle_expires_at: string;
  absolute_expires_at: string;
};

export type AdminLoginRequest = {
  username: string;
  password: string;
  /** Authenticator or recovery code, once the server asks for it (HTTP 428). */
  otp?: string;
};

export type AdminLogoutResponse = {
  authenticated: false;
  message: string;
};

/**
 * Authenticate an administrator and establish a browser session.
 */
export function loginAdmin(
  credentials: AdminLoginRequest,
): Promise<AdminSessionResponse> {
  return apiRequest<AdminSessionResponse>(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify(credentials),
    },
  );
}

/**
 * Retrieve the current administrator session.
 *
 * The backend also returns a fresh copy of the CSRF token.
 */
export function fetchAdminSession(
  signal?: AbortSignal,
): Promise<AdminSessionResponse> {
  return apiRequest<AdminSessionResponse>(
    "/api/auth/session",
    {
      method: "GET",
      cache: "no-store",
      signal,
    },
  );
}

/**
 * Revoke the current browser session.
 */
export function logoutAdmin(): Promise<AdminLogoutResponse> {
  return apiRequest<AdminLogoutResponse>(
    "/api/auth/logout",
    {
      method: "POST",
    },
  );
}

// --------------------------------------------------
// Two-factor authentication
// --------------------------------------------------

export type MfaStatus = {
  enabled: boolean;
  recovery_codes_remaining: number;
};

export type MfaSetup = {
  secret: string;
  otpauth_uri: string;
};

export function fetchMfaStatus(signal?: AbortSignal): Promise<MfaStatus> {
  return apiRequest<MfaStatus>("/api/auth/mfa", { method: "GET", signal });
}

export function startMfaSetup(): Promise<MfaSetup> {
  return apiRequest<MfaSetup>("/api/auth/mfa/setup", { method: "POST" });
}

export function enableMfa(code: string): Promise<{ enabled: true; recovery_codes: string[] }> {
  return apiRequest("/api/auth/mfa/enable", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function disableMfa(password: string, code: string): Promise<{ enabled: false }> {
  return apiRequest("/api/auth/mfa/disable", {
    method: "POST",
    body: JSON.stringify({ password, code }),
  });
}
