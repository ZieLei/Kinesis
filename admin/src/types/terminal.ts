export type TerminalStatus = "Connected" | "Disconnected";

export type ManagedTerminal = {
  id: number;
  terminal_code: string;
  device_id: string;
  name: string;
  device_type: string;
  platform: string;
  app_version: string | null;
  ip_address: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_sync_at: string | null;
  status: TerminalStatus;
  is_enabled: boolean;
  maintenance_mode: boolean;
};

export type TerminalListResponse = {
  items: ManagedTerminal[];
  limit: number;
  offset: number;
  count: number;
  total_count: number;
  connected_count: number;
  disconnected_count: number;
  maintenance_count: number;
  heartbeat_timeout_seconds: number;
};

export type TerminalActionResponse = {
  terminal_id?: number;
  command_id?: number;
  status?: string;
  is_enabled?: boolean;
  maintenance_mode?: boolean;
  message: string;
};

export type TerminalBroadcastResponse = {
  message: string;
  recipient_count: number;
  commands_created: number;
  created_at?: string;
};
