import { credentials } from "@/lib/auth/credentials";
import {
  API_BASE_URL,
  INSECURE_TRANSPORT_ERROR,
} from "@/lib/config";

export { API_BASE_URL };

const REQUEST_TIMEOUT_MS = 15000;

export type ApiErrorKind = "http" | "network" | "timeout" | "config";

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

function assertSecureTransport() {
  if (INSECURE_TRANSPORT_ERROR) {
    // Refuse rather than silently sending credentials in cleartext.
    throw new ApiError(INSECURE_TRANSPORT_ERROR, 0, "config");
  }
}

async function getAuthenticatedRequest(
  path: string,
  options: RequestInit,
): Promise<RequestInit> {
  const headers = new Headers(options.headers);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const extras = await credentials.authorize(
    path,
    options.method ?? "GET",
    headers,
  );

  return {
    ...options,
    ...extras,
    headers,
  };
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

    assertSecureTransport();

    const authenticatedRequest = await getAuthenticatedRequest(
      path,
      options,
    );

    if (callerSignal?.aborted) {
      throw new Error("The request was cancelled.");
    }

    const response = await sendRequest(
      path,
      authenticatedRequest,
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


/**
 * Authenticated request returning the raw Response (for binary downloads
 * such as the GCash QR image). Same credential handling as apiRequest.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  assertSecureTransport();

  const authenticatedRequest = await getAuthenticatedRequest(
    path,
    options,
  );

  return fetch(`${API_BASE_URL}${path}`, authenticatedRequest);
}
