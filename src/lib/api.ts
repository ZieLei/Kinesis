export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const REQUEST_TIMEOUT_MS = 15000;

async function sendRequest(
  path: string,
  options: RequestInit,
  controller: AbortController,
): Promise<Response> {
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options.body && !isFormData
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    // Cancelled by the caller (e.g. the screen lost focus): not a failure.
    if (options.signal?.aborted) throw error;

    console.error("[API] Request failed:", {
      path,
      method: options.method ?? "GET",
      error,
    });

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        "The request timed out. Check your connection and try again.",
      );
    }

    throw new Error(
      `Request to ${path} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  let message = `Request failed (${response.status}).`;

  try {
    const body = await response.json();

    if (typeof body.detail === "string") {
      message = body.detail;
    } else if (Array.isArray(body.detail)) {
      message = body.detail
        .map((item: { msg?: string }) => item.msg || "Invalid input")
        .join("\n");
    }
  } catch {
    // Keep the HTTP status message if the response isn't JSON.
  }

  return message;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Honour a caller-supplied signal while still enforcing the timeout.
  const callerSignal = options.signal;
  const abortFromCaller = () => controller.abort();

  if (callerSignal?.aborted) {
    controller.abort();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    const response = await sendRequest(path, options, controller);

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}
