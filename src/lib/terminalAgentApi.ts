import { apiRequest, API_BASE_URL } from "@/lib/api";

export type TerminalRegistrationRequest = {
  device_id: string;
  name: string;
  device_type: string;
  platform: string;
  app_version: string | null;
};

export type TerminalRegistrationResponse = {
  terminal_id: number;
  device_id: string;
  session_token: string;
  is_enabled: boolean;
  maintenance_mode: boolean;
  heartbeat_interval_seconds: number;
};

export type TerminalHeartbeatResponse = {
  terminal_id: number;
  device_id: string;
  server_time: string;
  heartbeat_interval_seconds: number;
  is_enabled: boolean;
  maintenance_mode: boolean;
  commands: Array<{
    id: number;
    command_type: "sync" | "broadcast";
    payload: string | null;
    created_at: string;
  }>;
};

export type TerminalPOSSettings = {
  currencySymbol: string;
  currencyPlacement: "before" | "after";
  decimalPrecision: string;
  cashRounding: string;
  lowStockThreshold: string;
  allowNegativeInventory: boolean;
  skuFormat: string;
  skuPrefix: string;
  skuDigits: string;
  skuIncludeYear: boolean;
  taxRate: string;
  receiptHeader: string;
  receiptFooter: string;
  receiptNotes: string;
  digitalReceipts: boolean;
  receiptOutput: "bluetooth" | "sms" | "qr";
  supervisorPinForDiscounts: boolean;
  allowCustomLineItems: boolean;
  discountLimit: string;
  inactivityLock: string;
  offlineQueueStrategy: string;
};

export type TerminalSettingsResponse = {
  settings: TerminalPOSSettings;
  version: number;
  updated_at: string;
};

export type TerminalSettingsSocketMessage =
  | {
    type: "authenticated";
    terminal_id: number;
  }
  | {
    type: "settings_updated";
    version: number;
  }
  | {
    type: "ping";
  };

export function registerTerminal(
  registration: TerminalRegistrationRequest,
  enrollmentKey: string,
): Promise<TerminalRegistrationResponse> {
  return apiRequest<TerminalRegistrationResponse>(
    "/api/terminals/register",
    {
      method: "POST",
      headers: {
        "X-Terminal-Enrollment-Key": enrollmentKey,
      },
      body: JSON.stringify(registration),
    },
  );
}

export function sendTerminalHeartbeat(
  sessionToken: string,
  appVersion: string | null,
): Promise<TerminalHeartbeatResponse> {
  return apiRequest<TerminalHeartbeatResponse>(
    "/api/terminals/heartbeat",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        app_version: appVersion,
      }),
    },
  );
}

export function fetchTerminalSettings(
  sessionToken: string,
  signal?: AbortSignal,
): Promise<TerminalSettingsResponse> {
  return apiRequest<TerminalSettingsResponse>(
    "/api/terminals/settings",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
      signal,
    },
  );
}

export function connectTerminalSettingsSocket(
  sessionToken: string,
): WebSocket {
  const websocketBaseUrl = API_BASE_URL
    .replace(/^https:/i, "wss:")
    .replace(/^http:/i, "ws:");

  const socket = new WebSocket(
    `${websocketBaseUrl}/api/terminals/ws`,
  );

  // Authenticate through the first WebSocket message.
  // The session token is not placed in the URL.
  socket.onopen = () => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "authenticate",
          session_token: sessionToken,
        }),
      );
    }
  };

  return socket;
}
