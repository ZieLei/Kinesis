
import { apiRequest } from "./api";

import type {
  TerminalActionResponse,
  TerminalBroadcastResponse,
  TerminalConnectionMetricsResponse,
  TerminalListResponse,
} from "../types/terminal";

const PAGE_SIZE = 100;


function adminHeaders(token: string): Headers {
  const normalizedToken = token.trim();

  if (!normalizedToken) {
    throw new Error("An admin token is required.");
  }

  return new Headers({
    "X-Admin-Token": normalizedToken,
  });
}

async function fetchTerminalPage(
  token: string,
  search: string,
  offset: number,
  signal?: AbortSignal,
): Promise<TerminalListResponse> {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });

  if (search.trim()) {
    params.set("search", search.trim());
  }

  return apiRequest<TerminalListResponse>(
    `/api/admin/terminals?${params.toString()}`,
    {
      headers: adminHeaders(token),
      signal,
    },
  );
}

export async function fetchAdminTerminals(
  token: string,
  search = "",
  signal?: AbortSignal,
): Promise<TerminalListResponse> {
  const allItems: TerminalListResponse["items"] = [];

  let offset = 0;
  let metadata: TerminalListResponse | null = null;

  while (true) {
    const page = await fetchTerminalPage(
      token,
      search,
      offset,
      signal,
    );

    if (!Array.isArray(page.items)) {
      throw new Error("The server returned an invalid terminal list.");
    }

    allItems.push(...page.items);
    metadata = page;

    if (
      allItems.length >= page.count ||
      page.items.length < PAGE_SIZE
    ) {
      break;
    }

    offset += page.items.length;
  }

  if (!metadata) {
    throw new Error("The server did not return terminal data.");
  }

  return {
    ...metadata,
    items: allItems,
    count: allItems.length,
  };
}

export function fetchTerminalConnectionMetrics(
  token: string,
  signal?: AbortSignal,
): Promise<TerminalConnectionMetricsResponse> {
  return apiRequest<TerminalConnectionMetricsResponse>(
    "/api/admin/terminals/metrics",
    {
      method: "GET",
      headers: adminHeaders(token),
      signal,
    },
  );
}

export function requestTerminalSync(
  token: string,
  terminalId: number,
): Promise<TerminalActionResponse> {
  return apiRequest<TerminalActionResponse>(
    `/api/admin/terminals/${terminalId}/sync`,
    {
      method: "POST",
      headers: adminHeaders(token),
    },
  );
}

export function updateTerminalMaintenance(
  token: string,
  terminalId: number,
  maintenanceMode: boolean,
): Promise<TerminalActionResponse> {
  return apiRequest<TerminalActionResponse>(
    `/api/admin/terminals/${terminalId}/maintenance`,
    {
      method: "PATCH",
      headers: adminHeaders(token),
      body: JSON.stringify({
        maintenance_mode: maintenanceMode,
      }),
    },
  );
}

export function broadcastToTerminals(
  token: string,
  message: string,
): Promise<TerminalBroadcastResponse> {
  return apiRequest<TerminalBroadcastResponse>(
    "/api/admin/terminals/broadcast",
    {
      method: "POST",
      headers: adminHeaders(token),
      body: JSON.stringify({ message }),
    },
  );
}

export function disableTerminal(
  token: string,
  terminalId: number,
): Promise<TerminalActionResponse> {
  return apiRequest<TerminalActionResponse>(
    `/api/admin/terminals/${terminalId}/disconnect`,
    {
      method: "POST",
      headers: adminHeaders(token),
    },
  );
}

export function enableTerminal(
  token: string,
  terminalId: number,
): Promise<TerminalActionResponse> {
  return apiRequest<TerminalActionResponse>(
    `/api/admin/terminals/${terminalId}/enable`,
    {
      method: "POST",
      headers: adminHeaders(token),
    },
  );
}
