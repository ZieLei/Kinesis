import { apiRequest } from "./api";

import type {
  TerminalActionResponse,
  TerminalBroadcastResponse,
  TerminalListResponse,
} from "../types/terminal";

const PAGE_SIZE = 100;

function adminHeaders(token: string): HeadersInit {
  return {
    "X-Admin-Token": token,
  };
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
      method: "GET",
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
  if (!token.trim()) {
    throw new Error("Enter the admin API token to connect.");
  }

  const firstPage = await fetchTerminalPage(
    token,
    search,
    0,
    signal,
  );

  const items = [...firstPage.items];
  let offset = firstPage.items.length;

  while (items.length < firstPage.count) {
    if (signal?.aborted) {
      throw new DOMException("Request cancelled.", "AbortError");
    }

    const page = await fetchTerminalPage(
      token,
      search,
      offset,
      signal,
    );

    if (page.items.length === 0) {
      break;
    }

    items.push(...page.items);
    offset += page.items.length;
  }

  return {
    ...firstPage,
    items,
  };
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
