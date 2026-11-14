export type ControlResult = {
  id?: string;
  action?: "restart" | "shutdown";
  state: "running" | "done" | "failed";
  started_at?: string;
  finished_at?: string;
  message?: string;
};

export type ServerStatus = {
  maintenance: {
    enabled: boolean;
    changed_at: string | null;
    changed_by: string | null;
  };
  control: {
    /** False until the control service is installed on the host. */
    available: boolean;
    pending: { id: string; action: "restart" | "shutdown"; requested_at: string } | null;
    last: ControlResult | null;
  };
  server: {
    started_at: string;
    uptime_seconds: number;
  };
};

export type ServerAction = "restart" | "shutdown";

export type ServerActionResponse = {
  id: string;
  action: ServerAction;
  state: "requested";
};

export type NotificationSeverity = "critical" | "warning" | "info";

export type AdminNotification = {
  /** Changes when the situation changes, so a dismissed alert can return. */
  id: string;
  severity: NotificationSeverity;
  title: string;
  detail: string;
  /** The tab to open for this alert. */
  target: string;
};

export type NotificationsResponse = {
  as_of: string;
  items: AdminNotification[];
};
