

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
