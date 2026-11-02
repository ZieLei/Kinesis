
import { apiRequest, API_BASE_URL } from "@/lib/api";

export type TerminalRegistrationRequest = {
  device_id: string;
  name: string;
  device_type: string;
  platform: string;
  app_version: string | null;
};

export type TerminalPairingResponse = {
  terminal_id: number;
  device_id: string;
  session_token: string;
  is_enabled: boolean;
  maintenance_mode: boolean;
  heartbeat_interval_seconds: number;
};

export type TerminalCommand = {
  id: number;
  command_type: "sync" | "broadcast";
  payload: string | null;
  created_at: string;
};

export type TerminalHeartbeatResponse = {
  terminal_id: number;
  device_id: string;
  server_time: string;
  heartbeat_interval_seconds: number;
  is_enabled: boolean;
  maintenance_mode: boolean;
  commands: TerminalCommand[];
};

export type TerminalCommandAcknowledgementResponse = {
  command_id: number;
  status: "acknowledged" | "failed";
  completed_at: string;
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
  gcashQrImagePath: string | null;
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
    ping_id: string;
  };

export function pairTerminal(
  registration: TerminalRegistrationRequest,
  pairingToken: string,
): Promise<TerminalPairingResponse> {
  return apiRequest<TerminalPairingResponse>(
    "/api/terminals/pair",
    {
      method: "POST",
      body: JSON.stringify({
        pairing_token: pairingToken,
        registration,
      }),
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

export function acknowledgeTerminalCommand(
  sessionToken: string,
  commandId: number,
  commandStatus: "acknowledged" | "failed",
  resultMessage: string | null = null,
): Promise<TerminalCommandAcknowledgementResponse> {
  return apiRequest<TerminalCommandAcknowledgementResponse>(
    `/api/terminals/commands/${commandId}/ack`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        status: commandStatus,
        result_message: resultMessage,
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
