import { useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Database as DatabaseIcon,
  Server,
  ShieldCheck,
  Eye,
  EyeOff,
  Copy,
  Check,
  CircleAlert,
  CircleCheck,
  Clock,
  HardDrive,
  Download,
  Upload,
  Cloud,
  RefreshCw,
  Search,
  Play,
  Table2,
  FileCode2,
  LockKeyhole,
  FileArchive,
  ChevronRight,
  X,
  Info,
} from "lucide-react";

type TableSchema = {
  name: string;
  description: string;
  columns: number;
  rows: number | null;
  size: string;
};

type QueryResult = {
  columns: string[];
  rows: Record<string, string | number | boolean | null>[];
};

const schemaTables: TableSchema[] = [
  {
    name: "products",
    description: "Product inventory and pricing",
    columns: 0,
    rows: null,
    size: "—",
  },
  {
    name: "orders",
    description: "Sales transactions",
    columns: 0,
    rows: null,
    size: "—",
  },
  {
    name: "order_items",
    description: "Items belonging to each sale",
    columns: 0,
    rows: null,
    size: "—",
  },
  {
    name: "users",
    description: "Staff accounts and access",
    columns: 0,
    rows: null,
    size: "—",
  },
];

function SectionHeading({
  icon: Icon,
  title,
  description,
  color = "text-ctp-mauve",
}: {
  icon: typeof DatabaseIcon;
  title: string;
  description: string;
  color?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ctp-surface0 ${color}`}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <h2 className="font-line-seed text-sm font-bold text-ctp-text">
          {title}
        </h2>
        <p className="mt-0.5 font-line-seed text-xs text-ctp-subtext0">
          {description}
        </p>
      </div>
    </div>
  );
}

function StatusBadge({
  label,
  tone = "yellow",
}: {
  label: string;
  tone?: "green" | "yellow" | "red" | "blue" | "gray";
}) {
  const styles = {
    green: "bg-ctp-green/10 text-ctp-green",
    yellow: "bg-ctp-yellow/10 text-ctp-yellow",
    red: "bg-ctp-red/10 text-ctp-red",
    blue: "bg-ctp-blue/10 text-ctp-blue",
    gray: "bg-ctp-surface1 text-ctp-subtext0",
  };

  const dotStyles = {
    green: "bg-ctp-green",
    yellow: "bg-ctp-yellow",
    red: "bg-ctp-red",
    blue: "bg-ctp-blue",
    gray: "bg-ctp-overlay1",
  };

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 font-line-seed text-[10px] font-bold ${styles[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[tone]}`} />
      {label}
    </span>
  );
}

function UnavailableNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-ctp-yellow/20 bg-ctp-yellow/5 p-3">
      <Info size={15} className="mt-0.5 shrink-0 text-ctp-yellow" />
      <p className="font-line-seed text-xs leading-5 text-ctp-subtext1">
        {children}
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof DatabaseIcon;
  color: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="font-line-seed text-xs text-ctp-subtext0">{label}</p>
        <p className="mt-0.5 truncate font-line-seed text-base font-bold text-ctp-text">
          {value}
        </p>
        <p className="mt-0.5 truncate font-line-seed text-[10px] text-ctp-subtext0">
          {detail}
        </p>
      </div>
    </div>
  );
}

export default function Database() {
  const [showUri, setShowUri] = useState(false);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState(
    "SELECT name FROM sqlite_master WHERE type = 'table';",
  );
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryMessage, setQueryMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Replace these demo flags with backend-derived state.
  const databaseConfigured = false;
  const backupServiceAvailable = false;
  const s3Configured = false;

  const connectionUri = "";
  const engine = "SQLite";

  const filteredTables = schemaTables.filter((table) =>
    `${table.name} ${table.description}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );

  async function copyConnectionUri() {
    if (!databaseConfigured || !connectionUri) return;

    try {
      await navigator.clipboard.writeText(connectionUri);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice("Could not copy the connection URI. Check browser permissions.");
    }
  }

  function runQuery() {
    setQueryResult(null);

    if (!query.trim()) {
      setQueryMessage("Enter a SQL query first.");
      return;
    }

    if (!databaseConfigured) {
      setQueryMessage(
        "SQL execution is disabled because the database is not configured.",
      );
      return;
    }

    setQueryMessage(
      "The SQL endpoint is not connected. No query was executed.",
    );
  }

  function handleFile(file: File | undefined) {
    if (!file) return;

    const validExtensions = [
      ".sql",
      ".dump",
      ".db",
      ".sqlite",
      ".backup",
    ];

    const valid = validExtensions.some((extension) =>
      file.name.toLowerCase().endsWith(extension),
    );

    if (!valid) {
      setSelectedFile(null);
      setShowRestoreConfirm(false);
      setNotice(
        "Unsupported file. Select a .sql, .dump, .db, .sqlite, or .backup file.",
      );
      return;
    }

    setNotice("");
    setShowRestoreConfirm(false);
    setSelectedFile(file);
  }

  function requestRestore() {
    if (!selectedFile) {
      setNotice("Select a backup file first.");
      return;
    }

    if (!backupServiceAvailable || !databaseConfigured) {
      setNotice(
        "Restore is unavailable until the backend restore service is implemented. The file has not been uploaded.",
      );
      setShowRestoreConfirm(false);
      return;
    }

    setNotice("Connect the authenticated restore endpoint before proceeding.");
    setShowRestoreConfirm(false);
  }

  function requestBackup() {
    setNotice(
      "Backup service unavailable. No snapshot or SQL dump was created.",
    );
  }

  function requestS3Backup() {
    setNotice(
      "S3 backup is not configured. Configure server-side storage credentials first.",
    );
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  const inputClass =
    "min-w-0 rounded-md border border-ctp-surface0 bg-ctp-base px-3 py-2 font-line-seed text-sm text-ctp-text outline-none placeholder:text-ctp-overlay1 focus:border-ctp-mauve";

  const actionClass =
    "inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 font-line-seed text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <DatabaseIcon size={21} className="text-ctp-mauve" />
            <h1 className="font-line-seed text-xl font-bold text-ctp-text">
              Database Management
            </h1>
          </div>
          <p className="mt-1 font-line-seed text-xs text-ctp-subtext0">
            Inspect the database, manage backups, and prepare SQL queries.
          </p>
        </div>

        <StatusBadge
          label={databaseConfigured ? "CONFIGURED" : "NOT CONFIGURED"}
          tone={databaseConfigured ? "green" : "yellow"}
        />
      </header>

      {/* Current state */}
      <section className="rounded-lg border border-ctp-yellow/20 bg-ctp-yellow/5 p-3">
        <div className="flex items-start gap-2.5">
          <CircleAlert
            size={18}
            className="mt-0.5 shrink-0 text-ctp-yellow"
          />
          <div className="min-w-0 flex-1">
            <h2 className="font-line-seed text-sm font-bold text-ctp-text">
              {databaseConfigured
                ? "Database configuration detected"
                : "Database connection is not configured"}
            </h2>
            <p className="mt-1 font-line-seed text-xs leading-5 text-ctp-subtext1">
              {databaseConfigured
                ? "Configuration is available. Connect a real health check to verify database connectivity."
                : "The database API is not connected. Table inspection, SQL execution, and backup operations are unavailable."}
            </p>
          </div>
          <StatusBadge
            label={databaseConfigured ? "UNVERIFIED" : "OFFLINE"}
            tone={databaseConfigured ? "blue" : "red"}
          />
        </div>
      </section>

      {/* Summary */}
      <section
        aria-label="Database status"
        className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Engine"
          value={engine}
          detail="Intended database"
          icon={DatabaseIcon}
          color="bg-ctp-blue/10 text-ctp-blue"
        />
        <StatCard
          label="Connection"
          value={databaseConfigured ? "Unverified" : "Unavailable"}
          detail="No live health check"
          icon={Server}
          color="bg-ctp-yellow/10 text-ctp-yellow"
        />
        <StatCard
          label="Schema"
          value="Pending"
          detail="4 anticipated tables"
          icon={Table2}
          color="bg-ctp-mauve/10 text-ctp-mauve"
        />
        <StatCard
          label="Backups"
          value={backupServiceAvailable ? "Available" : "Unavailable"}
          detail="Backend service required"
          icon={HardDrive}
          color="bg-ctp-red/10 text-ctp-red"
        />
      </section>

      {/* Connection */}
      <section className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3 sm:p-4">
        <SectionHeading
          icon={ShieldCheck}
          title="Connection details"
          description="Review the intended engine and connection settings."
        />

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border border-ctp-surface0 p-3">
            <p className="font-line-seed text-[11px] text-ctp-subtext0">
              Database engine
            </p>
            <p className="mt-1.5 flex items-center gap-2 font-line-seed text-sm font-semibold text-ctp-text">
              <DatabaseIcon size={15} className="text-ctp-blue" />
              {engine}
            </p>
            <p className="mt-1 font-line-seed text-[10px] text-ctp-subtext0">
              Local database
            </p>
          </div>

          <div className="rounded-md border border-ctp-surface0 p-3">
            <p className="font-line-seed text-[11px] text-ctp-subtext0">
              Host / port
            </p>
            <p className="mt-1.5 font-mono text-sm font-semibold text-ctp-text">
              Not applicable
            </p>
            <p className="mt-1 font-line-seed text-[10px] text-ctp-subtext0">
              SQLite uses a file
            </p>
          </div>

          <div className="rounded-md border border-ctp-surface0 p-3">
            <p className="font-line-seed text-[11px] text-ctp-subtext0">
              Database file
            </p>
            <p className="mt-1.5 flex items-center gap-2 font-line-seed text-sm font-semibold text-ctp-text">
              <HardDrive size={15} className="text-ctp-blue" />
              Not configured
            </p>
            <p className="mt-1 font-line-seed text-[10px] text-ctp-subtext0">
              File path unavailable
            </p>
          </div>

          <div className="rounded-md border border-ctp-surface0 p-3">
            <p className="font-line-seed text-[11px] text-ctp-subtext0">
              Connection test
            </p>
            <p className="mt-1.5 flex items-center gap-2 font-line-seed text-sm font-semibold text-ctp-yellow">
              <CircleAlert size={15} />
              Not performed
            </p>
            <p className="mt-1 font-line-seed text-[10px] text-ctp-subtext0">
              Health endpoint required
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label className="font-line-seed text-xs font-semibold text-ctp-text">
              Connection URI
            </label>
            <span className="flex items-center gap-1 font-line-seed text-[10px] text-ctp-subtext0">
              <LockKeyhole size={12} />
              Sensitive information
            </span>
          </div>

          <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-ctp-surface0 bg-ctp-crust p-2">
            <code className="min-w-0 flex-1 break-all px-1 font-mono text-xs text-ctp-subtext0">
              {databaseConfigured && connectionUri
                ? showUri
                  ? connectionUri
                  : "••••••••••••••••••••••"
                : "Connection URI unavailable"}
            </code>

            <button
              type="button"
              onClick={() => setShowUri((current) => !current)}
              disabled={!databaseConfigured || !connectionUri}
              aria-label={showUri ? "Hide connection URI" : "Show connection URI"}
              className="shrink-0 rounded-md p-2 text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-text disabled:opacity-40"
            >
              {showUri ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>

            <button
              type="button"
              onClick={copyConnectionUri}
              disabled={!databaseConfigured || !connectionUri}
              className={`${actionClass} border-ctp-surface1 text-ctp-text hover:border-ctp-mauve/50 hover:text-ctp-mauve`}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <p className="mt-2 font-line-seed text-[11px] leading-5 text-ctp-subtext0">
            Retrieve credentials through a protected backend. Do not embed
            database secrets in frontend code.
          </p>
        </div>
      </section>

      {/* Schema */}
      <section className="overflow-hidden rounded-lg border border-ctp-surface0 bg-ctp-base">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeading
            icon={Table2}
            title="Core tables"
            description="Expected schema and record counts."
          />

          <div className="relative w-full sm:max-w-xs">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ctp-overlay1"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Filter tables"
              placeholder="Filter tables..."
              className={`${inputClass} w-full pl-9`}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-y border-ctp-surface0 bg-ctp-mantle px-3 py-2">
          <p className="font-line-seed text-[11px] text-ctp-subtext0">
            {filteredTables.length} of {schemaTables.length} anticipated tables
          </p>
          <StatusBadge label="NOT VERIFIED" tone="gray" />
        </div>

        <div className="divide-y divide-ctp-surface0">
          {filteredTables.map((table) => (
            <div
              key={table.name}
              className="flex flex-col gap-2 px-3 py-3 transition-colors hover:bg-ctp-surface0/20 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ctp-mauve/10 text-ctp-mauve">
                  <Table2 size={15} />
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold text-ctp-text">
                    {table.name}
                  </p>
                  <p className="mt-0.5 font-line-seed text-[11px] text-ctp-subtext0">
                    {table.description}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 sm:w-[260px] sm:shrink-0">
                <div>
                  <p className="font-line-seed text-[10px] text-ctp-subtext0">
                    Columns
                  </p>
                  <p className="mt-1 font-mono text-xs text-ctp-subtext1">
                    —
                  </p>
                </div>
                <div>
                  <p className="font-line-seed text-[10px] text-ctp-subtext0">
                    Rows
                  </p>
                  <p className="mt-1 font-mono text-xs text-ctp-subtext1">
                    —
                  </p>
                </div>
                <div>
                  <p className="font-line-seed text-[10px] text-ctp-subtext0">
                    Size
                  </p>
                  <p className="mt-1 font-mono text-xs text-ctp-subtext1">
                    —
                  </p>
                </div>
              </div>
            </div>
          ))}

          {filteredTables.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="font-line-seed text-sm font-semibold text-ctp-text">
                No matching tables
              </p>
              <p className="mt-1 font-line-seed text-xs text-ctp-subtext0">
                Try another table name or description.
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-ctp-surface0 p-3">
          <UnavailableNotice>
            These table names are planned, not verified. Connect the database
            API to load actual columns, row counts, and storage sizes.
          </UnavailableNotice>
        </div>
      </section>

      {/* Backup and restore */}
      <section className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3 sm:p-4">
        <SectionHeading
          icon={HardDrive}
          title="Backup & restore"
          description="Create exports or select a backup to restore."
        />

        <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-3">
          <div className="flex flex-col rounded-md border border-ctp-surface0 p-3">
            <div className="flex items-center gap-2">
              <FileArchive size={17} className="text-ctp-blue" />
              <h3 className="font-line-seed text-xs font-bold text-ctp-text">
                Database snapshot
              </h3>
            </div>
            <p className="mt-2 flex-1 font-line-seed text-xs leading-5 text-ctp-subtext0">
              Create a point-in-time copy before making major changes.
            </p>
            <button
              type="button"
              onClick={requestBackup}
              disabled={!backupServiceAvailable || !databaseConfigured}
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-md bg-ctp-blue/10 px-3 py-2 font-line-seed text-xs font-semibold text-ctp-blue hover:bg-ctp-blue/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <HardDrive size={14} />
              Create snapshot
            </button>
          </div>

          <div className="flex flex-col rounded-md border border-ctp-surface0 p-3">
            <div className="flex items-center gap-2">
              <Download size={17} className="text-ctp-green" />
              <h3 className="font-line-seed text-xs font-bold text-ctp-text">
                SQL export
              </h3>
            </div>
            <p className="mt-2 flex-1 font-line-seed text-xs leading-5 text-ctp-subtext0">
              Export the database for migration or archival.
            </p>
            <button
              type="button"
              onClick={requestBackup}
              disabled={!backupServiceAvailable || !databaseConfigured}
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-md border border-ctp-surface1 px-3 py-2 font-line-seed text-xs font-semibold text-ctp-text hover:border-ctp-green/50 hover:text-ctp-green disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={14} />
              Download SQL
            </button>
          </div>

          <div className="flex flex-col rounded-md border border-ctp-surface0 p-3">
            <div className="flex items-center gap-2">
              <Cloud size={17} className="text-ctp-peach" />
              <h3 className="font-line-seed text-xs font-bold text-ctp-text">
                Remote backup
              </h3>
            </div>
            <p className="mt-2 flex-1 font-line-seed text-xs leading-5 text-ctp-subtext0">
              Store encrypted copies in S3-compatible storage.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <StatusBadge
                label={s3Configured ? "CONFIGURED" : "NOT CONFIGURED"}
                tone={s3Configured ? "green" : "yellow"}
              />
              <button
                type="button"
                onClick={requestS3Backup}
                className="inline-flex items-center gap-1 font-line-seed text-xs font-semibold text-ctp-mauve hover:text-ctp-lavender"
              >
                Configure
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-md border border-ctp-surface0 p-3">
          <div className="flex items-center gap-2">
            <RefreshCw size={17} className="text-ctp-red" />
            <div>
              <h3 className="font-line-seed text-xs font-bold text-ctp-text">
                Restore from backup
              </h3>
              <p className="mt-0.5 font-line-seed text-[11px] text-ctp-subtext0">
                Choose a .sql, .dump, .db, .sqlite, or .backup file.
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".sql,.dump,.db,.sqlite,.backup"
            className="hidden"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setDragging(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              handleFile(event.dataTransfer.files?.[0]);
            }}
            className={`mt-3 rounded-md border border-dashed p-4 transition-colors ${dragging
                ? "border-ctp-mauve bg-ctp-mauve/10"
                : "border-ctp-surface1"
              }`}
          >
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-2.5">
                <Upload size={18} className="shrink-0 text-ctp-mauve" />
                <div className="min-w-0">
                  <p className="font-line-seed text-xs font-semibold text-ctp-text">
                    {selectedFile
                      ? selectedFile.name
                      : "Drop a backup file here"}
                  </p>
                  <p className="mt-1 font-line-seed text-[11px] text-ctp-subtext0">
                    {selectedFile
                      ? `${formatFileSize(selectedFile.size)} · Selected locally`
                      : "Or browse files on your device"}
                  </p>
                </div>
              </div>

              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`${actionClass} border-ctp-surface1 text-ctp-text hover:border-ctp-mauve/50`}
                >
                  Browse
                </button>

                {selectedFile && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setShowRestoreConfirm(false);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                      className={`${actionClass} border-ctp-surface1 text-ctp-subtext0 hover:text-ctp-red`}
                    >
                      <X size={13} />
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRestoreConfirm((current) => !current)}
                      className={`${actionClass} border-ctp-red/20 bg-ctp-red/10 text-ctp-red hover:bg-ctp-red/20`}
                    >
                      <RefreshCw size={13} />
                      Prepare restore
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {showRestoreConfirm && selectedFile && (
            <div className="mt-3 rounded-md border border-ctp-yellow/20 bg-ctp-yellow/5 p-3">
              <div className="flex items-start gap-2">
                <CircleAlert
                  size={16}
                  className="mt-0.5 shrink-0 text-ctp-yellow"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-line-seed text-xs font-semibold text-ctp-text">
                    Confirm restore preparation
                  </p>
                  <p className="mt-1 break-words font-line-seed text-xs leading-5 text-ctp-subtext1">
                    {selectedFile.name} has not been uploaded. The backend
                    restore service must validate the file and protect existing
                    data before any restore can proceed.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={requestRestore}
                      className={`${actionClass} border-ctp-red/20 bg-ctp-red/10 text-ctp-red`}
                    >
                      Continue
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRestoreConfirm(false)}
                      className={`${actionClass} border-ctp-surface1 text-ctp-text`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <p className="mt-3 font-line-seed text-[11px] leading-5 text-ctp-subtext0">
            Restoring can overwrite existing data. A production service must
            validate the file, verify compatibility, and create a pre-restore
            backup before applying changes.
          </p>
        </div>
      </section>

      {/* SQL editor */}
      <section className="overflow-hidden rounded-lg border border-ctp-surface0 bg-ctp-base">
        <div className="flex flex-col gap-3 border-b border-ctp-surface0 p-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionHeading
            icon={FileCode2}
            title="SQL query"
            description="Prepare a query and inspect its results."
          />
          <StatusBadge label="EXECUTION DISABLED" tone="yellow" />
        </div>

        <div className="p-3">
          <div className="overflow-hidden rounded-md border border-ctp-surface0 bg-ctp-crust">
            <div className="flex items-center justify-between border-b border-ctp-surface0 bg-ctp-mantle px-3 py-2">
              <span className="font-mono text-[11px] text-ctp-subtext0">
                query.sql
              </span>
              <span className="font-mono text-[10px] text-ctp-overlay1">
                SQLite
              </span>
            </div>

            <textarea
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setQueryMessage("");
                setQueryResult(null);
              }}
              spellCheck={false}
              rows={5}
              aria-label="SQL query editor"
              placeholder="SELECT * FROM products LIMIT 10;"
              className="w-full resize-y bg-transparent p-3 font-mono text-xs leading-6 text-ctp-text outline-none placeholder:text-ctp-overlay1"
            />

            <div className="flex flex-col justify-between gap-2 border-t border-ctp-surface0 bg-ctp-mantle p-3 sm:flex-row sm:items-center">
              <p className="font-line-seed text-[11px] text-ctp-subtext0">
                No SQL will execute until the backend is connected.
              </p>
              <button
                type="button"
                onClick={runQuery}
                disabled={!databaseConfigured}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-ctp-mauve px-3 py-2 font-line-seed text-xs font-bold text-ctp-base hover:bg-ctp-mauve/80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Play size={13} />
                Run query
              </button>
            </div>
          </div>

          {queryMessage && (
            <div
              role="status"
              className="mt-3 flex items-start gap-2 rounded-md border border-ctp-yellow/20 bg-ctp-yellow/5 p-3"
            >
              <CircleAlert
                size={15}
                className="mt-0.5 shrink-0 text-ctp-yellow"
              />
              <p className="font-line-seed text-xs leading-5 text-ctp-subtext1">
                {queryMessage}
              </p>
            </div>
          )}

          <div className="mt-3 overflow-hidden rounded-md border border-ctp-surface0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ctp-surface0 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Table2 size={15} className="text-ctp-blue" />
                <h3 className="font-line-seed text-xs font-bold text-ctp-text">
                  Results
                </h3>
              </div>
              <span className="font-line-seed text-[11px] text-ctp-subtext0">
                {queryResult
                  ? `${queryResult.rows.length} rows`
                  : "No results"}
              </span>
            </div>

            {queryResult && queryResult.columns.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-left">
                  <thead className="bg-ctp-mantle">
                    <tr className="border-b border-ctp-surface0">
                      {queryResult.columns.map((column) => (
                        <th
                          key={column}
                          className="px-3 py-2 font-mono text-xs font-semibold text-ctp-mauve"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ctp-surface0">
                    {queryResult.rows.map((row, index) => (
                      <tr key={index}>
                        {queryResult.columns.map((column) => (
                          <td
                            key={column}
                            className="px-3 py-2 font-mono text-xs text-ctp-text"
                          >
                            {row[column] === null
                              ? "NULL"
                              : String(row[column] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                <Table2 size={22} className="text-ctp-overlay1" />
                <p className="mt-2 font-line-seed text-xs font-semibold text-ctp-text">
                  No results to display
                </p>
                <p className="mt-1 max-w-sm font-line-seed text-[11px] leading-5 text-ctp-subtext0">
                  Connect the database and query API to display returned rows.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Feedback */}
      {notice && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-ctp-blue/20 bg-ctp-blue/5 p-3"
        >
          <Info size={15} className="mt-0.5 shrink-0 text-ctp-blue" />
          <p className="flex-1 font-line-seed text-xs leading-5 text-ctp-subtext1">
            {notice}
          </p>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
            className="shrink-0 rounded p-1 text-ctp-subtext0 hover:text-ctp-text"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Security */}
      <footer className="flex items-start gap-2.5 rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
        <LockKeyhole size={16} className="mt-0.5 shrink-0 text-ctp-overlay1" />
        <div>
          <h3 className="font-line-seed text-xs font-bold text-ctp-text">
            Database security
          </h3>
          <p className="mt-1 font-line-seed text-[11px] leading-5 text-ctp-subtext0">
            Require administrator authentication for database operations.
            Restrict SQL permissions, use parameterized queries where
            applicable, enforce timeouts, and audit destructive actions. Never
            expose database credentials or unrestricted SQL execution to clients.
          </p>
        </div>
      </footer>
    </div>
  );
}
