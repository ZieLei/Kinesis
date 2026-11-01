
import { apiRequest } from "./api";

import type {
  TerminalActionResponse,
  TerminalBroadcastResponse,
  TerminalConnectionMetricsResponse,
  TerminalListResponse,
} from "../types/terminal";


const PAGE_SIZE = 100;


// --------------------------------------------------
// Fetch registered terminals
// --------------------------------------------------


async function fetchTerminalPage(
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
      signal,
    },
  );
}


export async function fetchAdminTerminals(
  search = "",
  signal?: AbortSignal,
): Promise<TerminalListResponse> {
  const allItems: TerminalListResponse["items"] = [];

  let offset = 0;
  let metadata: TerminalListResponse | null = null;

  while (true) {
    const page = await fetchTerminalPage(
      search,
      offset,
      signal,
    );

    if (!Array.isArray(page.items)) {
      throw new Error(
        "The server returned an invalid terminal list.",
      );
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
    throw new Error(
      "The server did not return terminal data.",
    );
  }

  return {
    ...metadata,
    items: allItems,
    count: allItems.length,
  };
}


// --------------------------------------------------
// Terminal connection metrics
// --------------------------------------------------


export function fetchTerminalConnectionMetrics(
  signal?: AbortSignal,
): Promise<TerminalConnectionMetricsResponse> {
  return apiRequest<TerminalConnectionMetricsResponse>(
    "/api/admin/terminals/metrics",
    {
      method: "GET",
      signal,
    },
  );
}


// --------------------------------------------------
// Request terminal synchronization
// --------------------------------------------------


export function requestTerminalSync(
  terminalId: number,
): Promise<TerminalActionResponse> {
  return apiRequest<TerminalActionResponse>(
    `/api/admin/terminals/${terminalId}/sync`,
    {
      method: "POST",
    },
  );
}


// --------------------------------------------------
// Terminal maintenance
// --------------------------------------------------


export function updateTerminalMaintenance(
  terminalId: number,
  maintenanceMode: boolean,
): Promise<TerminalActionResponse> {
  return apiRequest<TerminalActionResponse>(
    `/api/admin/terminals/${terminalId}/maintenance`,
    {
      method: "PATCH",
      body: JSON.stringify({
        maintenance_mode: maintenanceMode,
      }),
    },
  );
}


// --------------------------------------------------
// Broadcast
// --------------------------------------------------


export function broadcastToTerminals(
  message: string,
): Promise<TerminalBroadcastResponse> {
  return apiRequest<TerminalBroadcastResponse>(
    "/api/admin/terminals/broadcast",
    {
      method: "POST",
      body: JSON.stringify({
        message,
      }),
    },
  );
}


// --------------------------------------------------
// Disable terminal access
// --------------------------------------------------


export function disableTerminal(
  terminalId: number,
): Promise<TerminalActionResponse> {
  return apiRequest<TerminalActionResponse>(
    `/api/admin/terminals/${terminalId}/disconnect`,
    {
      method: "POST",
    },
  );
}


// --------------------------------------------------
// Enable terminal access
// --------------------------------------------------


export function enableTerminal(
  terminalId: number,
): Promise<TerminalActionResponse> {
  return apiRequest<TerminalActionResponse>(
    `/api/admin/terminals/${terminalId}/enable`,
    {
      method: "POST",
    },
  );
}
