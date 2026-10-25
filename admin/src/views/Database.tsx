import { useRef, useState } from "react";
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
    <div className="mb-5 flex items-center gap-3">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ctp-surface0 ${color}`}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <h2 className="font-inter text-lg font-bold text-ctp-text">
          {title}
        </h2>
        <p className="font-inter text-sm text-ctp-subtext0">
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
    green: "bg-ctp-green/15 text-ctp-green",
    yellow: "bg-ctp-yellow/15 text-ctp-yellow",
    red: "bg-ctp-red/15 text-ctp-red",
    blue: "bg-ctp-blue/15 text-ctp-blue",
    gray: "bg-ctp-surface1 text-ctp-subtext0",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-inter text-xs font-bold ${styles[tone]}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${tone === "green"
          ? "bg-ctp-green"
          : tone === "yellow"
            ? "bg-ctp-yellow"
            : tone === "red"
              ? "bg-ctp-red"
              : tone === "blue"
                ? "bg-ctp-blue"
                : "bg-ctp-overlay1"
          }`}
      />
      {label}
    </span>
  );
}

function UnavailableNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-ctp-yellow/20 bg-ctp-yellow/5 p-3">
      <Info size={16} className="mt-0.5 shrink-0 text-ctp-yellow" />
      <p className="font-inter text-xs leading-5 text-ctp-subtext1">
        {children}
      </p>
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Backend integration flags.
  // Switch these to real API-derived state once the backend exists.
  const databaseConfigured = false;
  const backupServiceAvailable = false;
  const s3Configured = false;

  const connectionUri = "";
  const engine = "SQLite";
  const filteredTables = schemaTables.filter((table) =>
    `${table.name} ${table.description}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  async function copyConnectionUri() {
    if (!databaseConfigured || !connectionUri) return;

    try {
      await navigator.clipboard.writeText(connectionUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice("Unable to copy the connection URI. Check browser permissions.");
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
        "Query execution is unavailable because no database is configured.",
      );
      return;
    }

    // TODO: Send the query to an authenticated backend endpoint.
    setQueryMessage(
      "Database query API is not connected. Connect the backend before executing SQL.",
    );
  }

  function handleFile(file: File | undefined) {
    if (!file) return;

    const validExtensions = [".sql", ".dump", ".db", ".sqlite", ".backup"];
    const valid = validExtensions.some((extension) =>
      file.name.toLowerCase().endsWith(extension),
    );

    if (!valid) {
      setSelectedFile(null);
      setNotice("Unsupported file type. Select a .sql, .dump, .db, .sqlite, or .backup file.");
      return;
    }

    setNotice("");
    setSelectedFile(file);
  }

  function requestRestore() {
    if (!selectedFile) {
      setNotice("Select a backup file before requesting a restore.");
      return;
    }

    if (!backupServiceAvailable) {
      setNotice(
        "Restore is unavailable until the backend backup and restore service is implemented. Your file has not been uploaded.",
      );
      return;
    }

    // TODO: Upload to an authenticated restore endpoint.
    setNotice("Restore endpoint integration is required.");
  }

  function requestBackup() {
    setNotice(
      "Manual snapshots and SQL dumps require a backend backup endpoint. No backup has been created.",
    );
  }

  function requestS3Backup() {
    setNotice(
      "S3 backup is not configured. Add server-side object storage credentials before enabling this feature.",
    );
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <DatabaseIcon size={25} className="text-ctp-mauve" />
            <h1 className="font-inter text-2xl font-bold text-ctp-text">
              Database Management
            </h1>
          </div>
          <p className="mt-1 font-inter text-sm text-ctp-subtext0">
            Inspect your data layer, manage backups, and execute database queries.
          </p>
        </div>

        <StatusBadge label="NOT CONFIGURED" tone="yellow" />
      </div>

      {/* Overall database status */}
      <div className="rounded-xl border border-ctp-yellow/20 bg-ctp-yellow/5 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ctp-yellow/15 text-ctp-yellow">
            <CircleAlert size={21} />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="font-inter font-bold text-ctp-text">
              Database connection not configured
            </h2>
            <p className="mt-1 max-w-3xl font-inter text-sm leading-6 text-ctp-subtext1">
              This page is ready for backend integration, but it cannot inspect
              actual tables, credentials, row counts, or database health yet.
              Connect your FastAPI backend to enable database operations.
            </p>
          </div>

          <StatusBadge label="OFFLINE" tone="red" />
        </div>
      </div>

      {/* Connection details */}
      <section className="rounded-xl border border-ctp-surface0 bg-ctp-surface2/20 p-5">
        <SectionHeading
          icon={ShieldCheck}
          title="Connection & Credentials"
          description="Database engine, endpoint, and connection details."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
            <p className="font-inter text-xs font-medium text-ctp-subtext0">
              Database Engine
            </p>
            <div className="mt-2 flex items-center gap-2">
              <DatabaseIcon size={18} className="text-ctp-blue" />
              <span className="font-inter font-bold text-ctp-text">
                {engine}
              </span>
            </div>
            <p className="mt-2 font-inter text-xs text-ctp-subtext0">
              Intended engine
            </p>
          </div>

          <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
            <p className="font-inter text-xs font-medium text-ctp-subtext0">
              Host / Port
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Server size={18} className="text-ctp-blue" />
              <span className="font-mono text-sm font-bold text-ctp-text">
                Not configured
              </span>
            </div>
            <p className="mt-2 font-inter text-xs text-ctp-subtext0">
              SQLite does not require a network port
            </p>
          </div>

          <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
            <p className="font-inter text-xs font-medium text-ctp-subtext0">
              Database Name
            </p>
            <div className="mt-2 flex items-center gap-2">
              <HardDrive size={18} className="text-ctp-blue" />
              <span className="font-inter text-sm font-bold text-ctp-text">
                Not configured
              </span>
            </div>
            <p className="mt-2 font-inter text-xs text-ctp-subtext0">
              Database file path pending
            </p>
          </div>

          <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
            <p className="font-inter text-xs font-medium text-ctp-subtext0">
              Connection Status
            </p>
            <div className="mt-2 flex items-center gap-2">
              <CircleAlert size={18} className="text-ctp-yellow" />
              <span className="font-inter text-sm font-bold text-ctp-yellow">
                Unavailable
              </span>
            </div>
            <p className="mt-2 font-inter text-xs text-ctp-subtext0">
              No connection test performed
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="font-inter text-sm font-semibold text-ctp-text">
              Connection URI
            </label>
            <span className="flex items-center gap-1 font-inter text-xs text-ctp-subtext0">
              <LockKeyhole size={13} />
              Sensitive information
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-ctp-surface0 bg-ctp-crust p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-sm text-ctp-subtext0">
              {databaseConfigured && connectionUri
                ? showUri
                  ? connectionUri
                  : "••••••••••••••••••••••••••••"
                : "Connection URI unavailable"}
            </code>

            <button
              type="button"
              onClick={() => setShowUri((current) => !current)}
              disabled={!databaseConfigured || !connectionUri}
              aria-label={showUri ? "Hide connection URI" : "Show connection URI"}
              className="shrink-0 rounded-md p-2 text-ctp-subtext0 transition-colors hover:bg-ctp-surface0 hover:text-ctp-text disabled:cursor-not-allowed disabled:opacity-40"
            >
              {showUri ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>

            <button
              type="button"
              onClick={copyConnectionUri}
              disabled={!databaseConfigured || !connectionUri}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-ctp-surface1 px-3 py-2 font-inter text-xs font-semibold text-ctp-subtext1 transition-colors hover:border-ctp-mauve/50 hover:text-ctp-mauve disabled:cursor-not-allowed disabled:opacity-40"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <p className="mt-2 font-inter text-xs text-ctp-subtext0">
            Credentials should be retrieved from a protected backend endpoint
            and never embedded in frontend source code.
          </p>
        </div>
      </section>

      {/* Schema overview */}
      <section className="overflow-hidden rounded-xl border border-ctp-surface0 bg-ctp-surface2/20">
        <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <SectionHeading
            icon={Table2}
            title="Core Tables"
            description="Schema inventory, record counts, and estimated storage."
          />

          <div className="relative w-full sm:max-w-xs">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ctp-overlay1"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter tables..."
              className="w-full rounded-lg border border-ctp-surface0 bg-ctp-base py-2.5 pl-9 pr-3 font-inter text-sm text-ctp-text outline-none placeholder:text-ctp-overlay1 focus:border-ctp-mauve"
            />
          </div>
        </div>

        <div className="border-y border-ctp-surface0 bg-ctp-base px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-inter text-xs text-ctp-subtext0">
              {filteredTables.length} anticipated tables
            </p>
            <StatusBadge label="AWAITING SCHEMA" tone="gray" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left">
            <thead className="bg-ctp-base">
              <tr className="border-b border-ctp-surface0">
                <th className="px-5 py-3 font-inter text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
                  Table
                </th>
                <th className="px-5 py-3 font-inter text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
                  Columns
                </th>
                <th className="px-5 py-3 font-inter text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
                  Row Count
                </th>
                <th className="px-5 py-3 font-inter text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
                  Estimated Size
                </th>
                <th className="px-5 py-3 text-right font-inter text-xs font-semibold uppercase tracking-wide text-ctp-subtext0">
                  Status
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-ctp-surface0">
              {filteredTables.map((table) => (
                <tr
                  key={table.name}
                  className="transition-colors hover:bg-ctp-surface0/30"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ctp-mauve/10 text-ctp-mauve">
                        <Table2 size={16} />
                      </div>
                      <div>
                        <p className="font-mono text-sm font-semibold text-ctp-text">
                          {table.name}
                        </p>
                        <p className="mt-1 font-inter text-xs text-ctp-subtext0">
                          {table.description}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 font-mono text-sm text-ctp-subtext1">
                    —
                  </td>
                  <td className="px-5 py-4 font-mono text-sm text-ctp-subtext1">
                    —
                  </td>
                  <td className="px-5 py-4 font-mono text-sm text-ctp-subtext1">
                    —
                  </td>
                  <td className="px-5 py-4 text-right">
                    <StatusBadge label="UNAVAILABLE" tone="gray" />
                  </td>
                </tr>
              ))}

              {filteredTables.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center">
                    <p className="font-inter text-sm text-ctp-subtext0">
                      No matching tables.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-ctp-surface0 p-4">
          <UnavailableNotice>
            These are anticipated table names for planning only, not verified
            database tables. Actual schemas, columns, row counts, and sizes will
            be loaded from the backend once the database exists.
          </UnavailableNotice>
        </div>
      </section>

      {/* Backup and restore */}
      <section className="rounded-xl border border-ctp-surface0 bg-ctp-surface2/20 p-5">
        <SectionHeading
          icon={HardDrive}
          title="Backup & Data Management"
          description="Create snapshots, export data, or restore a previous backup."
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* Manual snapshot */}
          <div className="flex flex-col rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ctp-blue/15 text-ctp-blue">
                <FileArchive size={20} />
              </div>
              <div>
                <h3 className="font-inter font-bold text-ctp-text">
                  Manual Snapshot
                </h3>
                <p className="font-inter text-xs text-ctp-subtext0">
                  Point-in-time database copy
                </p>
              </div>
            </div>

            <p className="mt-4 flex-1 font-inter text-sm leading-6 text-ctp-subtext1">
              Create a recoverable snapshot before maintenance or major data
              changes.
            </p>

            <button
              type="button"
              onClick={requestBackup}
              disabled={!backupServiceAvailable || !databaseConfigured}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-ctp-blue/15 px-4 py-2.5 font-inter text-sm font-semibold text-ctp-blue transition-colors hover:bg-ctp-blue/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HardDrive size={16} />
              Create Snapshot
            </button>
          </div>

          {/* SQL dump */}
          <div className="flex flex-col rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ctp-green/15 text-ctp-green">
                <Download size={20} />
              </div>
              <div>
                <h3 className="font-inter font-bold text-ctp-text">
                  SQL Dump
                </h3>
                <p className="font-inter text-xs text-ctp-subtext0">
                  Export database contents
                </p>
              </div>
            </div>

            <p className="mt-4 flex-1 font-inter text-sm leading-6 text-ctp-subtext1">
              Generate a downloadable export for migration, archival, or
              disaster recovery.
            </p>

            <button
              type="button"
              onClick={requestBackup}
              disabled={!backupServiceAvailable || !databaseConfigured}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-ctp-surface1 px-4 py-2.5 font-inter text-sm font-semibold text-ctp-subtext1 transition-colors hover:border-ctp-green/40 hover:text-ctp-green disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} />
              Download SQL Dump
            </button>
          </div>

          {/* S3 */}
          <div className="flex flex-col rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ctp-peach/15 text-ctp-peach">
                <Cloud size={20} />
              </div>
              <div>
                <h3 className="font-inter font-bold text-ctp-text">
                  S3 Backup
                </h3>
                <p className="font-inter text-xs text-ctp-subtext0">
                  Remote backup storage
                </p>
              </div>
            </div>

            <p className="mt-4 flex-1 font-inter text-sm leading-6 text-ctp-subtext1">
              Store encrypted backups in an S3-compatible object storage
              service.
            </p>

            <div className="mt-4 flex items-center justify-between gap-2">
              <StatusBadge
                label={s3Configured ? "CONFIGURED" : "NOT CONFIGURED"}
                tone={s3Configured ? "green" : "yellow"}
              />
              <button
                type="button"
                onClick={requestS3Backup}
                className="inline-flex items-center gap-1 font-inter text-xs font-semibold text-ctp-mauve hover:text-ctp-lavender"
              >
                Configure
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Restore drop zone */}
        <div className="mt-5 rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ctp-red/10 text-ctp-red">
              <RefreshCw size={20} />
            </div>
            <div>
              <h3 className="font-inter font-bold text-ctp-text">
                Restore from Backup
              </h3>
              <p className="font-inter text-sm text-ctp-subtext0">
                Select a supported backup file to prepare for restoration.
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
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              handleFile(event.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center transition-colors ${dragging
              ? "border-ctp-mauve bg-ctp-mauve/10"
              : "border-ctp-surface1 hover:border-ctp-mauve/50 hover:bg-ctp-surface0/30"
              }`}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ctp-surface0 text-ctp-mauve">
              <Upload size={24} />
            </div>
            <p className="mt-3 font-inter text-sm font-semibold text-ctp-text">
              Drop your backup file here or{" "}
              <span className="text-ctp-mauve">browse files</span>
            </p>
            <p className="mt-1 font-inter text-xs text-ctp-subtext0">
              SQL, DUMP, DB, SQLITE, BACKUP
            </p>
          </div>

          {selectedFile && (
            <div className="mt-3 flex flex-col justify-between gap-3 rounded-lg border border-ctp-surface0 bg-ctp-crust p-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <FileCode2
                  size={20}
                  className="shrink-0 text-ctp-green"
                />
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm text-ctp-text">
                    {selectedFile.name}
                  </p>
                  <p className="font-inter text-xs text-ctp-subtext0">
                    {formatFileSize(selectedFile.size)} · Selected locally, not uploaded
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                  className="rounded-md p-2 text-ctp-subtext0 hover:bg-ctp-surface0 hover:text-ctp-red"
                  aria-label="Remove selected backup"
                >
                  <X size={16} />
                </button>
                <button
                  type="button"
                  onClick={requestRestore}
                  className="inline-flex items-center gap-2 rounded-lg bg-ctp-red/15 px-3 py-2 font-inter text-xs font-bold text-ctp-red transition-colors hover:bg-ctp-red/25"
                >
                  <RefreshCw size={14} />
                  Prepare Restore
                </button>
              </div>
            </div>
          )}

          <p className="mt-3 font-inter text-xs leading-5 text-ctp-subtext0">
            Restoring a backup can overwrite existing data. A production restore
            flow should validate the file server-side, verify compatibility,
            create a pre-restore snapshot, and require explicit confirmation.
          </p>
        </div>
      </section>

      {/* Quick query */}
      <section className="overflow-hidden rounded-xl border border-ctp-surface0 bg-ctp-surface2/20">
        <div className="p-5">
          <SectionHeading
            icon={FileCode2}
            title="Quick Query"
            description="Run SQL and inspect the resulting rows."
          />

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-ctp-mauve/15 px-2 py-1 font-mono text-xs font-bold text-ctp-mauve">
                SQL
              </span>
              <span className="font-inter text-xs text-ctp-subtext0">
                SQLite dialect intended
              </span>
            </div>

            <span className="flex items-center gap-1.5 font-inter text-xs text-ctp-yellow">
              <LockKeyhole size={13} />
              Execution disabled
            </span>
          </div>

          <div className="overflow-hidden rounded-lg border border-ctp-surface0 bg-ctp-crust">
            <div className="flex items-center justify-between border-b border-ctp-surface0 bg-ctp-mantle px-4 py-2.5">
              <span className="font-mono text-xs text-ctp-subtext0">
                query.sql
              </span>
              <span className="font-mono text-xs text-ctp-overlay1">
                {query.split("\n").length} line
                {query.split("\n").length === 1 ? "" : "s"}
              </span>
            </div>

            <textarea
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setQueryMessage("");
              }}
              spellCheck={false}
              rows={6}
              aria-label="SQL query editor"
              placeholder="SELECT * FROM products LIMIT 10;"
              className="w-full resize-y bg-transparent p-4 font-mono text-sm leading-6 text-ctp-text outline-none placeholder:text-ctp-overlay1"
            />

            <div className="flex flex-col justify-between gap-3 border-t border-ctp-surface0 bg-ctp-mantle px-4 py-3 sm:flex-row sm:items-center">
              <p className="font-inter text-xs text-ctp-subtext0">
                Use read-only queries for inspection where possible.
              </p>
              <button
                type="button"
                onClick={runQuery}
                disabled={!databaseConfigured}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-ctp-mauve px-4 py-2.5 font-inter text-sm font-bold text-ctp-base transition-colors hover:bg-ctp-mauve/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play size={15} />
                Run Query
              </button>
            </div>
          </div>

          {queryMessage && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-ctp-yellow/20 bg-ctp-yellow/5 p-3">
              <CircleAlert
                size={16}
                className="mt-0.5 shrink-0 text-ctp-yellow"
              />
              <p className="font-inter text-sm text-ctp-subtext1">
                {queryMessage}
              </p>
            </div>
          )}

          {/* Results */}
          <div className="mt-5 overflow-hidden rounded-lg border border-ctp-surface0 bg-ctp-base">
            <div className="flex flex-col justify-between gap-2 border-b border-ctp-surface0 px-4 py-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <Table2 size={16} className="text-ctp-blue" />
                <h3 className="font-inter text-sm font-bold text-ctp-text">
                  Query Results
                </h3>
              </div>
              <span className="font-inter text-xs text-ctp-subtext0">
                {queryResult
                  ? `${queryResult.rows.length} rows returned`
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
                          className="px-4 py-3 font-mono text-xs font-semibold text-ctp-mauve"
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
                            className="px-4 py-3 font-mono text-xs text-ctp-text"
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
              <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-ctp-surface0 text-ctp-overlay1">
                  <Table2 size={21} />
                </div>
                <p className="mt-3 font-inter text-sm font-semibold text-ctp-text">
                  No query results yet
                </p>
                <p className="mt-1 max-w-sm font-inter text-xs leading-5 text-ctp-subtext0">
                  Query output will appear here once a database is configured
                  and the backend query endpoint is connected.
                </p>
              </div>
            )}
          </div>

          {/* JSON preview format note */}
          <div className="mt-3 flex items-center gap-2 text-ctp-subtext0">
            <FileCode2 size={14} />
            <p className="font-inter text-xs">
              Results can be rendered as a table or raw JSON after backend integration.
            </p>
          </div>
        </div>
      </section>

      {/* Shared feedback */}
      {notice && (
        <div className="flex items-start gap-3 rounded-lg border border-ctp-blue/20 bg-ctp-blue/5 p-4">
          <Info size={17} className="mt-0.5 shrink-0 text-ctp-blue" />
          <p className="flex-1 font-inter text-sm leading-6 text-ctp-subtext1">
            {notice}
          </p>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
            className="rounded-md p-1 text-ctp-subtext0 hover:text-ctp-text"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Security note */}
      <div className="flex items-start gap-3 rounded-xl border border-ctp-surface0 bg-ctp-base p-4">
        <LockKeyhole size={18} className="mt-0.5 shrink-0 text-ctp-overlay1" />
        <div>
          <h3 className="font-inter text-sm font-semibold text-ctp-text">
            Database security
          </h3>
          <p className="mt-1 font-inter text-xs leading-5 text-ctp-subtext0">
            Protect database credentials and require administrator
            authentication for queries, backups, and restores. Use parameterized
            queries where applicable, enforce query permissions and timeouts,
            and audit destructive operations. Never expose database secrets or
            unrestricted SQL execution to ordinary clients.
          </p>
        </div>
      </div>
    </div>
  );
}
