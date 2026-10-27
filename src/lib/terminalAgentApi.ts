import { apiRequest } from "@/lib/api";

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
