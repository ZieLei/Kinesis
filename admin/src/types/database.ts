export type DatabaseStatus = {
  configured: boolean;
  connected: boolean;
  engine: string;
  driver: string;
  database_name: string;
  host: string;
  port: number;
  schema_name: string | null;
  server_version: string | null;
  response_time_ms: number | null;
  backup_service_available: boolean;
  s3_configured: boolean;
  backup_retention_days: number;
  query_max_rows: number;
  error: string | null;
};

export type TableColumn = {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
};

export type TableSchema = {
  name: string;
  description: string;
  columns: number;
  rows: number | null;
  row_count_is_estimate: boolean;
  size: string;
  size_bytes: number | null;
  column_details: TableColumn[];
};

export type DatabaseSchemaResponse = {
  schema_name: string;
  table_count: number;
  database_size_bytes: number;
  database_size: string;
  tables: TableSchema[];
  note: string;
};

export type QueryValue = string | number | boolean | null;

export type QueryResult = {
  columns: string[];
  rows: Record<string, QueryValue>[];
  row_count: number;
  truncated: boolean;
  max_rows: number;
  execution_time_ms: number;
  read_only: boolean;
};

export type BackupFormat = "custom" | "sql";

export type BackupMetadata = {
  file_name: string;
  purpose: "backup" | "pre_restore";
  format: "custom" | "sql";
  size_bytes: number;
  created_at: string;
};

export type BackupListResponse = {
  items: BackupMetadata[];
  count: number;
  retention_days: number;
};

export type RestoreResponse = {
  message: string;
  database_name: string;
  restored_file: string;
  pre_restore_backup: BackupMetadata;
  restored_at: string;
};
