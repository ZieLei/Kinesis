import * as SecureStore from "expo-secure-store";

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export const TERMINAL_SESSION_TOKEN_KEY =
  "kinesis-terminal-session-token";

export const CASHIER_SESSION_TOKEN_KEY =
  "kinesis-cashier-session-token";

const REQUEST_TIMEOUT_MS = 15000;

const ENROLLMENT_PATH = "/api/terminals/register";
const CASHIER_LOGIN_PATH = "/api/cashier-auth/login";

export type ApiErrorKind = "http" | "network" | "timeout";

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;

  constructor(
    message: string,
    status: number,
    kind: ApiErrorKind = "http",
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
  }
}

export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.kind === "network" || error.kind === "timeout")
  );
}

function isFormData(body: BodyInit | null | undefined): boolean {
  return (
    typeof FormData !== "undefined" &&
    body instanceof FormData
  );
}

async function getAuthenticatedHeaders(
  path: string,
  suppliedHeaders?: HeadersInit,
): Promise<Headers> {
  const headers = new Headers(suppliedHeaders);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const requestPath = path.split("?")[0];

  // Terminal enrollment does not use an existing terminal token.
  if (
    requestPath !== ENROLLMENT_PATH &&
    !headers.has("Authorization")
  ) {
    let sessionToken: string | null;

    try {
      sessionToken = await SecureStore.getItemAsync(
        TERMINAL_SESSION_TOKEN_KEY,
      );
    } catch (error) {
      console.error(
        "[API] Could not read terminal credentials:",
        error,
      );

      throw new Error(
        "Could not access terminal credentials in secure storage.",
      );
    }

    if (sessionToken) {
      headers.set(
        "Authorization",
        `Bearer ${sessionToken}`,
      );
    }
  }

  // PIN login does not require an existing cashier session.
  if (
    requestPath !== CASHIER_LOGIN_PATH &&
    !headers.has("X-Cashier-Session")
  ) {
    let cashierToken: string | null;

    try {
      cashierToken = await SecureStore.getItemAsync(
        CASHIER_SESSION_TOKEN_KEY,
      );
    } catch (error) {
      console.error(
        "[API] Could not read cashier credentials:",
        error,
      );

      throw new Error(
        "Could not access cashier credentials in secure storage.",
      );
    }

    if (cashierToken) {
      headers.set(
        "X-Cashier-Session",
        cashierToken,
      );
    }
  }

  return headers;
}

async function sendRequest(
  path: string,
  options: RequestInit,
  controller: AbortController,
  wasTimedOut: () => boolean,
): Promise<Response> {
  const isMultipart = isFormData(options.body);

  const headers = new Headers(options.headers);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (
    options.body &&
    !isMultipart &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers,
    });
  } catch (error) {
    // A component intentionally cancelled its request.
    // This is not a network failure.
    if (options.signal?.aborted) {
      throw error;
    }

    // Distinguish our request timeout from other fetch failures.
    if (controller.signal.aborted && wasTimedOut()) {
      throw new ApiError(
        "Kinesis took too long to respond. Check your connection and try again.",
        0,
        "timeout",
      );
    }

    if (controller.signal.aborted) {
      throw new Error("The request was cancelled.");
    }

    // React Native can report unavailable Wi-Fi, an unreachable host,
    // and some fetch cancellations as different low-level errors.
    // Present one consistent message to the UI.
    throw new ApiError(
      "Cannot connect to the Kinesis server. Connect this device to the shop's Wi-Fi and make sure the host computer is running.",
      0,
      "network",
    );
  }
}

async function readErrorMessage(
  response: Response,
): Promise<string> {
  let message = `Request failed (${response.status}).`;

  try {
    const body = await response.json();

    if (typeof body.detail === "string") {
      message = body.detail;
    } else if (Array.isArray(body.detail)) {
      message = body.detail
        .map(
          (item: { msg?: string }) =>
            item.msg || "Invalid input",
        )
        .join("\n");
    } else if (
      typeof body.detail === "object" &&
      body.detail !== null &&
      typeof body.detail.message === "string"
    ) {
      message = body.detail.message;
    }
  } catch {
    // Keep the HTTP status message when the response isn't JSON.
  }

  return message;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();

  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  const callerSignal = options.signal;

  const abortFromCaller = () => {
    controller.abort();
  };

  if (callerSignal?.aborted) {
    controller.abort();
  } else {
    callerSignal?.addEventListener(
      "abort",
      abortFromCaller,
      { once: true },
    );
  }

  try {
    if (controller.signal.aborted) {
      throw new Error("The request was cancelled.");
    }

    const authenticatedHeaders = await getAuthenticatedHeaders(
      path,
      options.headers,
    );

    if (callerSignal?.aborted) {
      throw new Error("The request was cancelled.");
    }

    const response = await sendRequest(
      path,
      {
        ...options,
        headers: authenticatedHeaders,
      },
      controller,
      () => timedOut,
    );

    if (!response.ok) {
      const message = await readErrorMessage(response);

      throw new ApiError(message, response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);

    callerSignal?.removeEventListener(
      "abort",
      abortFromCaller,
    );
  }
}
