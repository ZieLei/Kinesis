
const SAFE_METHODS = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
]);


export const API_BASE_URL =
  typeof window !== "undefined"
    ? window.location.origin
    : "";


let csrfToken: string | null = null;

let unauthorizedHandler: (() => void) | null = null;


// --------------------------------------------------
// Authentication integration
// --------------------------------------------------


export function setApiCsrfToken(
  token: string | null,
): void {
  csrfToken = token;
}


export function setApiUnauthorizedHandler(
  handler: (() => void) | null,
): void {
  unauthorizedHandler = handler;
}


// --------------------------------------------------
// Shared fetch implementation
// --------------------------------------------------


export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const normalizedPath = path.startsWith("/")
    ? path
    : `/${path}`;

  const pathname = normalizedPath.split("?")[0];

  const method = (
    init.method || "GET"
  ).toUpperCase();

  const isFormData =
    typeof FormData !== "undefined" &&
    init.body instanceof FormData;


  if (
    init.body !== undefined &&
    init.body !== null &&
    !isFormData &&
    !headers.has("Content-Type")
  ) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }


  // Login is protected by Origin validation.
  // Other unsafe requests require the session-specific CSRF token.
  if (
    !SAFE_METHODS.has(method) &&
    pathname !== "/api/auth/login" &&
    csrfToken
  ) {
    headers.set(
      "X-CSRF-Token",
      csrfToken,
    );
  }


  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}${normalizedPath}`,
      {
        ...init,
        method,
        headers,
        credentials: "include",
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw error;
    }

    throw new Error(
      `Cannot reach the Kinesis API at ${API_BASE_URL}. ` +
      "Check that FastAPI is running and that the connection is available.",
    );
  }


  // Expired or revoked sessions automatically return the application
  // to the unauthenticated state.
  //
  // Authentication endpoints handle their own 401 responses.
  if (
    response.status === 401 &&
    !pathname.startsWith("/api/auth/")
  ) {
    unauthorizedHandler?.();
  }


  return response;
}


// --------------------------------------------------
// API errors
// --------------------------------------------------


export class ApiError extends Error {
  public readonly status: number;

  constructor(
    message: string,
    status: number,
  ) {
    super(message);

    this.name = "ApiError";
    this.status = status;
  }
}


function getErrorDetail(
  payload: unknown,
  fallback: string,
): string {
  if (
    typeof payload === "string" &&
    payload.trim()
  ) {
    return payload;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "detail" in payload
  ) {
    const detail = payload.detail;

    if (
      typeof detail === "string" &&
      detail.trim()
    ) {
      return detail;
    }

    if (
      detail !== undefined &&
      detail !== null
    ) {
      return JSON.stringify(detail);
    }
  }

  return fallback;
}


// --------------------------------------------------
// Typed API request
// --------------------------------------------------


export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await apiFetch(
    path,
    init,
  );

  const responseText = await response.text();

  let payload: unknown = null;

  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = responseText;
    }
  }


  if (!response.ok) {
    throw new ApiError(
      getErrorDetail(
        payload,
        `The API request failed with status ${response.status}.`,
      ),
      response.status,
    );
  }


  if (!responseText) {
    return undefined as T;
  }


  if (typeof payload === "string") {
    throw new Error(
      "The Kinesis API returned a response that was not valid JSON.",
    );
  }


  return payload as T;
}
