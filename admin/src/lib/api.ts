const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

const viteEnvironment = (
  import.meta as ImportMeta & {
    env?: {
      VITE_API_BASE_URL?: string;
    };
  }
).env;

const configuredBaseUrl = viteEnvironment?.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = (
  configuredBaseUrl || DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

export class ApiError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function getErrorDetail(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (typeof payload === "object" && payload !== null && "detail" in payload) {
    const detail = payload.detail;

    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }

    if (detail !== undefined && detail !== null) {
      return JSON.stringify(detail);
    }
  }

  return fallback;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;

  if (init.body !== undefined && init.body !== null && !isFormData) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${normalizedPath}`, {
      ...init,
      headers,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }

    throw new Error(
      `Cannot reach the Kinesis API at ${API_BASE_URL}. ` +
      "Check that FastAPI is running and that the configured URL is reachable.",
    );
  }

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
