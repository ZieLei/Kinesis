
import { apiRequest } from "@/lib/api";
import { credentials } from "@/lib/auth/credentials";
import { INSECURE_TRANSPORT_ERROR, websocketUrl } from "@/lib/config";

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
  // Native clients receive the credential; browsers get an HttpOnly cookie
  // and a CSRF token instead.
  session_token?: string;
  csrf_token?: string;
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
  // Present when the server rotates a native terminal's credential.
  session_token?: string;
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
  /** The GCash account customers pay to. Absent in settings cached by an older version. */
  gcashNumber?: string;
  gcashAccountName?: string;
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
  appVersion: string | null,
): Promise<TerminalHeartbeatResponse> {
  return apiRequest<TerminalHeartbeatResponse>(
    "/api/terminals/heartbeat",
    {
      method: "POST",
      body: JSON.stringify({
        app_version: appVersion,
      }),
    },
  );
}

export function acknowledgeTerminalCommand(
  commandId: number,
  commandStatus: "acknowledged" | "failed",
  resultMessage: string | null = null,
): Promise<TerminalCommandAcknowledgementResponse> {
  return apiRequest<TerminalCommandAcknowledgementResponse>(
    `/api/terminals/commands/${commandId}/ack`,
    {
      method: "POST",
      body: JSON.stringify({
        status: commandStatus,
        result_message: resultMessage,
      }),
    },
  );
}

export function fetchTerminalSettings(
  signal?: AbortSignal,
): Promise<TerminalSettingsResponse> {
  return apiRequest<TerminalSettingsResponse>(
    "/api/terminals/settings",
    {
      method: "GET",
      signal,
    },
  );
}

export function connectTerminalSettingsSocket(): WebSocket {
  if (INSECURE_TRANSPORT_ERROR) {
    throw new Error(INSECURE_TRANSPORT_ERROR);
  }

  const socket = new WebSocket(websocketUrl("/api/terminals/ws"));

  socket.onopen = () => {
    // Native: send the keystore credential as the first message.
    // Web: the HttpOnly cookie already authenticated the handshake.
    void credentials.authenticateSocket(socket).catch(() => {
      socket.close();
    });
  };

  return socket;
}
