import { useEffect, useMemo, useState } from "react";
import type { ReactNode, ElementType } from "react";
import {
  Settings2,
  Store,
  Package,
  Receipt,
  ShieldCheck,
  Server,
  Terminal,
  Save,
  RotateCcw,
  Info,
  CircleAlert,
  Check,
  ChevronDown,
  PhilippinePeso,
  Printer,
  Smartphone,
  Database,
  Network,
  Clock,
  LockKeyhole,
  SlidersHorizontal,
  ScanBarcode,
  HardDrive,
  Activity,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";

type SettingsState = {
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
  listenAddress: string;
  httpPort: string;
  corsOrigins: string;
  websocketHeartbeat: string;
  offlineQueueStrategy: string;
  backupSchedule: string;
  logLevel: string;
  consoleBufferLines: string;
};

const defaultSettings: SettingsState = {
  currencySymbol: "₱",
  currencyPlacement: "before",
  decimalPrecision: "2",
  cashRounding: "0.01",
  lowStockThreshold: "5",
  allowNegativeInventory: false,
  skuFormat: "prefix-sequence",
  skuPrefix: "KNS",
  skuDigits: "6",
  skuIncludeYear: false,
  taxRate: "0",
  receiptHeader: "KINESIS MOTORCYCLE PARTS",
  receiptFooter: "Thank you for your purchase!",
  receiptNotes: "Please keep your receipt for returns and exchanges.",
  digitalReceipts: false,
  receiptOutput: "bluetooth",
  supervisorPinForDiscounts: true,
  allowCustomLineItems: false,
  discountLimit: "10",
  inactivityLock: "5",
  listenAddress: "0.0.0.0",
  httpPort: "8000",
  corsOrigins: "http://localhost:5173",
  websocketHeartbeat: "30",
  offlineQueueStrategy: "queue-and-retry",
  backupSchedule: "daily",
  logLevel: "INFO",
  consoleBufferLines: "1000",
};

const inputClass =
  "w-full min-w-0 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm text-ctp-text outline-none transition placeholder:text-ctp-overlay0 focus:border-ctp-mauve focus:ring-2 focus:ring-ctp-mauve/15 disabled:cursor-not-allowed disabled:opacity-50";

const selectClass =
  "w-full appearance-none rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 pr-9 text-sm text-ctp-text outline-none transition focus:border-ctp-mauve focus:ring-2 focus:ring-ctp-mauve/15 disabled:cursor-not-allowed disabled:opacity-50";

const labelClass = "mb-1.5 block text-sm font-medium text-ctp-text";

type Option = { label: string; value: string };

type FieldDefinition = {
  key: keyof SettingsState;
  label: string;
  description?: string;
  type?: "text" | "number" | "textarea" | "select";
  options?: Option[];
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  suffix?: string;
  disabled?: (settings: SettingsState) => boolean;
  transform?: (value: string) => string;
};

type SectionDefinition = {
  id: string;
  title: string;
  description: string;
  keywords: string;
  icon: LucideIcon;
  badge?: string;
  fields: FieldDefinition[];
};

const sections: SectionDefinition[] = [
  {
    id: "pos",
    title: "POS & Store policies",
    description: "Set currency formatting and transaction rules.",
    keywords: "currency peso money decimals rounding store global formatting",
    icon: Store,
    badge: "Global",
    fields: [
      {
        key: "currencySymbol",
        label: "Currency symbol",
        description: "Shown on prices, totals, and receipts.",
        type: "select",
        options: [
          { label: "₱ — Philippine peso", value: "₱" },
          { label: "$ — Dollar", value: "$" },
          { label: "¥ — Yen / Yuan", value: "¥" },
          { label: "€ — Euro", value: "€" },
          { label: "£ — Pound sterling", value: "£" },
          { label: "฿ — Thai baht", value: "฿" },
          { label: "₹ — Indian rupee", value: "₹" },
        ],
      },
      {
        key: "currencyPlacement",
        label: "Currency placement",
        type: "select",
        options: [
          { label: "Before amount — ₱ 1,234.50", value: "before" },
          { label: "After amount — 1,234.50 ₱", value: "after" },
        ],
      },
      {
        key: "decimalPrecision",
        label: "Decimal precision",
        description: "Decimal places shown for monetary amounts.",
        type: "select",
        options: [
          { label: "0 decimal places", value: "0" },
          { label: "2 decimal places", value: "2" },
          { label: "3 decimal places", value: "3" },
        ],
      },
      {
        key: "cashRounding",
        label: "Cash change rounding",
        description: "Applies to cash payments, not card or digital payments.",
        type: "select",
        options: [
          { label: "No rounding — ₱0.01", value: "0.01" },
          { label: "Nearest ₱0.05", value: "0.05" },
          { label: "Nearest ₱0.10", value: "0.10" },
          { label: "Nearest ₱1.00", value: "1.00" },
        ],
      },
    ],
  },
  {
    id: "inventory",
    title: "Inventory & SKU",
    description: "Set stock warnings and product identifier rules.",
    keywords: "inventory stock negative low threshold sku barcode product part prefix sequence",
    icon: Package,
    fields: [
      {
        key: "lowStockThreshold",
        label: "Low-stock threshold",
        description: "Flag products at or below this quantity.",
        type: "number",
        min: 0,
        step: 1,
        suffix: "units",
      },
      {
        key: "allowNegativeInventory",
        label: "Allow negative inventory",
        description:
          "Allow sales to reduce stock below zero. Reconcile discrepancies during stock audits.",
        type: "select",
        options: [
          { label: "Disabled", value: "false" },
          { label: "Enabled", value: "true" },
        ],
      },
      {
        key: "skuFormat",
        label: "SKU format",
        type: "select",
        options: [
          { label: "Prefix + sequence", value: "prefix-sequence" },
          { label: "Sequence only", value: "sequence-only" },
          { label: "Prefix + PART + sequence", value: "prefix-part-sequence" },
        ],
      },
      {
        key: "skuPrefix",
        label: "SKU prefix",
        type: "text",
        disabled: (settings) => settings.skuFormat === "sequence-only",
        transform: (value) =>
          value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12),
      },
      {
        key: "skuDigits",
        label: "Sequence digits",
        type: "select",
        options: [
          { label: "4 digits — 0001", value: "4" },
          { label: "5 digits — 00001", value: "5" },
          { label: "6 digits — 000001", value: "6" },
          { label: "8 digits — 00000001", value: "8" },
        ],
      },
      {
        key: "skuIncludeYear",
        label: "Include year in SKU",
        description: "Add the current year to generated SKUs.",
        type: "select",
        options: [
          { label: "Disabled", value: "false" },
          { label: "Enabled", value: "true" },
        ],
      },
    ],
  },
  {
    id: "receipts",
    title: "Tax & receipts",
    description: "Configure tax, receipt content, and delivery.",
    keywords: "tax vat receipt printer bluetooth sms qr digital header footer notes",
    icon: Receipt,
    fields: [
      {
        key: "taxRate",
        label: "Tax rate",
        description: "Confirm the applicable rate and exemptions for your business.",
        type: "number",
        min: 0,
        max: 100,
        step: 0.01,
        suffix: "%",
      },
      {
        key: "receiptOutput",
        label: "Default receipt output",
        description: "Default destination after a sale.",
        type: "select",
        options: [
          { label: "Bluetooth thermal printer", value: "bluetooth" },
          { label: "SMS receipt", value: "sms" },
          { label: "QR code receipt", value: "qr" },
        ],
      },
      {
        key: "digitalReceipts",
        label: "Enable digital receipts",
        description: "Allow electronic receipt delivery.",
        type: "select",
        options: [
          { label: "Disabled", value: "false" },
          { label: "Enabled", value: "true" },
        ],
      },
      {
        key: "receiptHeader",
        label: "Receipt header",
        description: "Store name and contact details printed at the top.",
        type: "textarea",
        rows: 2,
      },
      {
        key: "receiptFooter",
        label: "Receipt footer",
        description: "Closing message printed after transaction details.",
        type: "textarea",
        rows: 2,
      },
      {
        key: "receiptNotes",
        label: "Custom receipt notes",
        description: "Return policy, warranty disclaimer, or other store notes.",
        type: "textarea",
        rows: 3,
      },
    ],
  },
  {
    id: "permissions",
    title: "Cashier permissions",
    description: "Set safeguards for sales actions on POS terminals.",
    keywords: "cashier supervisor pin discount permissions authorization custom line items lock inactivity",
    icon: ShieldCheck,
    badge: "Access control",
    fields: [
      {
        key: "supervisorPinForDiscounts",
        label: "Supervisor PIN for discounts",
        description: "Require supervisor authorization before applying a discount.",
        type: "select",
        options: [
          { label: "Required", value: "true" },
          { label: "Not required", value: "false" },
        ],
      },
      {
        key: "allowCustomLineItems",
        label: "Allow custom line items",
        description: "Allow manually priced services, such as labor charges.",
        type: "select",
        options: [
          { label: "Disabled", value: "false" },
          { label: "Enabled", value: "true" },
        ],
      },
      {
        key: "discountLimit",
        label: "Maximum cashier discount",
        description: "Discounts above this percentage should require approval.",
        type: "number",
        min: 0,
        max: 100,
        step: 1,
        suffix: "%",
      },
      {
        key: "inactivityLock",
        label: "POS inactivity auto-lock",
        description: "Time without activity before the terminal locks.",
        type: "select",
        options: [
          { label: "5 minutes", value: "5" },
          { label: "10 minutes", value: "10" },
          { label: "15 minutes", value: "15" },
          { label: "30 minutes", value: "30" },
          { label: "60 minutes", value: "60" },
          { label: "Disabled", value: "disabled" },
        ],
      },
    ],
  },
  {
    id: "server",
    title: "Server & network",
    description: "Configure the laptop-hosted API and terminal connections.",
    keywords: "backend api host address port cors websocket heartbeat offline queue network lan restart",
    icon: Server,
    badge: "Backend",
    fields: [
      {
        key: "listenAddress",
        label: "Listen address",
        description: "Network interface the API binds to.",
        type: "select",
        options: [
          { label: "0.0.0.0 — All interfaces", value: "0.0.0.0" },
          { label: "127.0.0.1 — Localhost only", value: "127.0.0.1" },
        ],
      },
      {
        key: "httpPort",
        label: "HTTP port",
        description: "Port used by the API and WebSocket endpoint.",
        type: "number",
        min: 1,
        max: 65535,
      },
      {
        key: "websocketHeartbeat",
        label: "WebSocket heartbeat",
        description: "Interval used to detect disconnected terminals.",
        type: "number",
        min: 5,
        max: 300,
        suffix: "seconds",
      },
      {
        key: "offlineQueueStrategy",
        label: "Offline queue strategy",
        description: "How pending terminal operations are handled during outages.",
        type: "select",
        options: [
          { label: "Queue and retry", value: "queue-and-retry" },
          { label: "Queue; manual reconciliation", value: "manual-reconciliation" },
          { label: "Reject operations when offline", value: "reject-offline" },
        ],
      },
      {
        key: "corsOrigins",
        label: "CORS allowed origins",
        description:
          "Enter one origin per line, including scheme and port. Avoid wildcards in production.",
        type: "textarea",
        rows: 3,
      },
    ],
  },
  {
    id: "backups",
    title: "Database backups",
    description: "Choose how often the backend should create backups.",
    keywords: "database backup restore schedule storage retention local automatic",
    icon: HardDrive,
    fields: [
      {
        key: "backupSchedule",
        label: "Automatic backup schedule",
        description: "The server should create a recoverable backup at this interval.",
        type: "select",
        options: [
          { label: "Every 6 hours", value: "every-6-hours" },
          { label: "Every 12 hours", value: "every-12-hours" },
          { label: "Daily", value: "daily" },
          { label: "Weekly", value: "weekly" },
          { label: "Manual only", value: "manual" },
        ],
      },
    ],
  },
  {
    id: "diagnostics",
    title: "Logs & diagnostics",
    description: "Set log verbosity and console buffer limits.",
    keywords: "logs debug info warning error critical diagnostics console buffer memory activity",
    icon: Terminal,
    fields: [
      {
        key: "logLevel",
        label: "System log level",
        description: "Minimum severity recorded by the backend logger.",
        type: "select",
        options: [
          { label: "DEBUG — Detailed diagnostics", value: "DEBUG" },
          { label: "INFO — Normal operation", value: "INFO" },
          { label: "WARNING — Potential issues", value: "WARNING" },
          { label: "ERROR — Failures only", value: "ERROR" },
          { label: "CRITICAL — Severe failures", value: "CRITICAL" },
        ],
      },
      {
        key: "consoleBufferLines",
        label: "Console buffer retention",
        description: "Maximum log lines kept in the admin console's memory.",
        type: "select",
        options: [
          { label: "250 lines", value: "250" },
          { label: "500 lines", value: "500" },
          { label: "1,000 lines", value: "1000" },
          { label: "2,500 lines", value: "2500" },
          { label: "5,000 lines", value: "5000" },
          { label: "10,000 lines", value: "10000" },
        ],
      },
    ],
  },
  {
    id: "security",
    title: "Security notes",
    description: "Review implementation requirements before connecting the backend.",
    keywords: "security credentials plaintext audit idempotent conflict validation authorization",
    icon: LockKeyhole,
    fields: [],
  },
];

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? "bg-ctp-mauve" : "bg-ctp-surface1"
        }`}
    >
      <span
        className={`absolute left-0.5 size-4 rounded-full bg-ctp-base shadow-sm transition-transform ${checked ? "translate-x-4" : "translate-x-0"
          }`}
      />
    </button>
  );
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className={labelClass}>{label}</label>
      {children}
      {description && (
        <p className="mt-1 text-xs leading-relaxed text-ctp-subtext0">
          {description}
        </p>
      )}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        className={`${selectClass} ${disabled ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ctp-subtext0"
      />
    </div>
  );
}

function Section({
  id,
  icon: Icon,
  title,
  description,
  children,
  badge,
}: {
  id: string;
  icon: ElementType;
  title: string;
  description: string;
  children: ReactNode;
  badge?: string;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-5 overflow-hidden rounded-xl border border-ctp-surface0 bg-ctp-mantle"
    >
      <div className="flex items-start gap-3 border-b border-ctp-surface0 px-4 py-3">
        <div className="rounded-lg border border-ctp-surface1 bg-ctp-base p-1.5 text-ctp-mauve">
          <Icon size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ctp-text">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-ctp-subtext0">
            {description}
          </p>
        </div>
        {badge && (
          <span className="shrink-0 rounded-md bg-ctp-surface0 px-2 py-1 text-[10px] font-semibold text-ctp-subtext1">
            {badge}
          </span>
        )}
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

export default function Settings() {
  const [settings, setSettings] =
    useState<SettingsState>({ ...defaultSettings });
  const [savedSettings, setSavedSettings] =
    useState<SettingsState>({ ...defaultSettings });
  const [showSaveNotice, setShowSaveNotice] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState("pos");

  const update = <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setShowSaveNotice(false);
  };

  const hasChanges =
    JSON.stringify(settings) !== JSON.stringify(savedSettings);

  const filteredSections = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sections;

    return sections.filter((section) =>
      `${section.title} ${section.description} ${section.keywords}`
        .toLowerCase()
        .includes(query),
    );
  }, [search]);

  const navigateTo = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top,
          );

        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      {
        rootMargin: "-15% 0px -70% 0px",
        threshold: 0,
      },
    );

    sections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const currencyPreview = (() => {
    const amount = (1234.5).toLocaleString("en-PH", {
      minimumFractionDigits: Number(settings.decimalPrecision),
      maximumFractionDigits: Number(settings.decimalPrecision),
    });

    return settings.currencyPlacement === "before"
      ? `${settings.currencySymbol}${amount}`
      : `${amount} ${settings.currencySymbol}`;
  })();

  const skuPreview = (() => {
    const sequence = "1".padStart(Number(settings.skuDigits), "0");
    const year = settings.skuIncludeYear
      ? `${new Date().getFullYear()}-`
      : "";

    if (settings.skuFormat === "prefix-sequence") {
      return `${settings.skuPrefix}-${year}${sequence}`;
    }

    if (settings.skuFormat === "sequence-only") {
      return `${year}${sequence}`;
    }

    return `${settings.skuPrefix}-${year}PART-${sequence}`;
  })();

  const saveSettings = () => {
    setSavedSettings({ ...settings });
    setNoticeMessage(
      "Preview saved in this page only. Changes have not been sent to the backend or other terminals.",
    );
    setShowSaveNotice(true);
  };

  const resetSettings = () => {
    setSettings({ ...defaultSettings });
    setShowSaveNotice(false);
    setNoticeMessage(
      "Default values restored in this page. Save to update the preview state.",
    );
  };

  const restoreSavedSettings = () => {
    setSettings({ ...savedSettings });
    setShowSaveNotice(false);
    setNoticeMessage("");
  };

  const renderField = (field: FieldDefinition) => {
    const rawValue = settings[field.key];
    const value =
      typeof rawValue === "boolean" ? String(rawValue) : String(rawValue);
    const disabled = field.disabled?.(settings) ?? false;

    const handleChange = (nextValue: string) => {
      let finalValue = field.transform
        ? field.transform(nextValue)
        : nextValue;

      if (
        field.key === "allowNegativeInventory" ||
        field.key === "digitalReceipts" ||
        field.key === "supervisorPinForDiscounts" ||
        field.key === "allowCustomLineItems" ||
        field.key === "skuIncludeYear"
      ) {
        update(field.key, (finalValue === "true") as never);
        return;
      }

      if (field.key === "currencyPlacement") {
        update(
          field.key,
          finalValue as SettingsState["currencyPlacement"],
        );
        return;
      }

      if (field.key === "receiptOutput") {
        update(field.key, finalValue as SettingsState["receiptOutput"]);
        return;
      }

      update(field.key, finalValue as never);
    };

    return (
      <Field
        key={field.key}
        label={field.label}
        description={field.description}
      >
        {field.type === "select" ? (
          <SelectField
            value={value}
            onChange={handleChange}
            options={field.options ?? []}
            disabled={disabled}
          />
        ) : field.type === "textarea" ? (
          <textarea
            className={`${inputClass} resize-y`}
            value={value}
            rows={field.rows ?? 2}
            maxLength={
              field.key === "receiptNotes"
                ? 1000
                : field.key === "corsOrigins"
                  ? undefined
                  : 500
            }
            onChange={(event) => handleChange(event.target.value)}
            disabled={disabled}
          />
        ) : (
          <div className="relative">
            <input
              className={`${inputClass} ${field.suffix ? "pr-16" : ""}`}
              type={field.type === "number" ? "number" : "text"}
              value={value}
              min={field.min}
              max={field.max}
              step={field.step}
              maxLength={field.key === "skuPrefix" ? 12 : undefined}
              onChange={(event) => handleChange(event.target.value)}
              disabled={disabled}
              placeholder={
                field.key === "skuPrefix" ? "KNS" : undefined
              }
            />
            {field.suffix && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ctp-subtext0">
                {field.suffix}
              </span>
            )}
          </div>
        )}
      </Field>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] pb-28 font-line-seed">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-ctp-subtext0">
            <Settings2 size={13} />
            <span>ADMINISTRATION</span>
            <span className="text-ctp-overlay0">/</span>
            <span className="text-ctp-mauve">SETTINGS</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-ctp-text">
            System settings
          </h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ctp-subtext0">
            Configure POS policies, inventory, receipts, permissions, and the server.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-ctp-yellow/25 bg-ctp-yellow/10 px-3 py-2">
          <CircleAlert size={15} className="shrink-0 text-ctp-yellow" />
          <div>
            <p className="text-xs font-semibold text-ctp-yellow">
              Backend not connected
            </p>
            <p className="mt-0.5 text-[10px] text-ctp-subtext0">
              Preview only
            </p>
          </div>
        </div>
      </header>

      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-ctp-blue/20 bg-ctp-blue/5 px-3 py-2.5">
        <Info size={16} className="mt-0.5 shrink-0 text-ctp-blue" />
        <p className="text-xs leading-relaxed text-ctp-subtext0">
          Changes currently affect this page only. Connect the backend to persist settings and distribute them to terminals.
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Left navigation */}
        <aside className="min-w-0 lg:sticky lg:top-4">
          <div className="rounded-xl border border-ctp-surface0 bg-ctp-mantle p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-ctp-text">
                SETTINGS
              </p>
              <span className="text-[10px] text-ctp-subtext0">
                {filteredSections.length} sections
              </span>
            </div>

            <div className="relative mb-3">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ctp-subtext0"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search settings..."
                aria-label="Search settings sections"
                className={`${inputClass} pl-9 pr-8 text-xs`}
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ctp-subtext0 hover:text-ctp-text"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
              {filteredSections.map((section) => {
                const Icon = section.icon;
                const active = activeSection === section.id;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => navigateTo(section.id)}
                    className={`flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition lg:w-full ${active
                        ? "bg-ctp-mauve/15 font-semibold text-ctp-mauve"
                        : "text-ctp-subtext1 hover:bg-ctp-surface0 hover:text-ctp-text"
                      }`}
                  >
                    <Icon size={15} className="shrink-0" />
                    <span className="whitespace-nowrap lg:whitespace-normal">
                      {section.title}
                    </span>
                  </button>
                );
              })}
            </nav>

            {filteredSections.length === 0 && (
              <div className="rounded-lg bg-ctp-base px-3 py-4 text-center">
                <Search
                  size={18}
                  className="mx-auto mb-2 text-ctp-subtext0"
                />
                <p className="text-xs font-medium text-ctp-text">
                  No matching sections
                </p>
                <p className="mt-1 text-[11px] text-ctp-subtext0">
                  Try another keyword.
                </p>
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="mt-3 text-xs font-medium text-ctp-mauve hover:underline"
                >
                  Clear search
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Settings content */}
        <main className="min-w-0 space-y-4">
          {filteredSections.length === 0 ? (
            <div className="rounded-xl border border-ctp-surface0 bg-ctp-mantle px-5 py-12 text-center">
              <Search size={24} className="mx-auto mb-3 text-ctp-subtext0" />
              <h2 className="text-sm font-semibold text-ctp-text">
                No settings found
              </h2>
              <p className="mt-1 text-xs text-ctp-subtext0">
                Search by a section name or topic such as currency, stock, receipt, or network.
              </p>
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-4 rounded-lg bg-ctp-mauve px-3 py-2 text-xs font-semibold text-ctp-base"
              >
                Show all settings
              </button>
            </div>
          ) : (
            filteredSections.map((section) => {
              const Icon = section.icon;

              return (
                <Section
                  key={section.id}
                  id={section.id}
                  icon={Icon}
                  title={section.title}
                  description={section.description}
                  badge={section.badge}
                >
                  {section.id === "pos" && (
                    <>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {section.fields.map(renderField)}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ctp-surface0 bg-ctp-base px-3 py-2.5">
                        <div className="flex items-center gap-2 text-xs text-ctp-subtext0">
                          <PhilippinePeso size={15} />
                          Formatting preview
                        </div>
                        <span className="text-base font-semibold tabular-nums text-ctp-green">
                          {currencyPreview}
                        </span>
                      </div>
                    </>
                  )}

                  {section.id === "inventory" && (
                    <>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {section.fields.map(renderField)}
                      </div>

                      {settings.allowNegativeInventory && (
                        <div className="flex items-start gap-2 rounded-lg border border-ctp-yellow/25 bg-ctp-yellow/5 p-3">
                          <CircleAlert size={15} className="mt-0.5 shrink-0 text-ctp-yellow" />
                          <p className="text-xs leading-relaxed text-ctp-subtext0">
                            Negative stock can hide inventory errors or allow sales of unavailable parts. Log the cashier, reason, and transaction for each exception.
                          </p>
                        </div>
                      )}

                      <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <ScanBarcode size={15} className="text-ctp-mauve" />
                          <p className="text-xs font-semibold text-ctp-text">
                            Next SKU preview
                          </p>
                        </div>
                        <code className="text-sm font-semibold tracking-wide text-ctp-green">
                          {skuPreview}
                        </code>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-ctp-subtext0">
                          Preview only. The backend must generate unique SKUs atomically.
                        </p>
                      </div>
                    </>
                  )}

                  {section.id === "receipts" && (
                    <>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {section.fields.map(renderField)}
                      </div>
                      <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
                        <div className="mb-3 flex items-center gap-2">
                          <Printer size={15} className="text-ctp-mauve" />
                          <p className="text-xs font-semibold text-ctp-text">
                            Receipt preview
                          </p>
                        </div>
                        <div className="mx-auto max-w-xs border border-dashed border-ctp-surface1 bg-ctp-mantle p-4 text-center">
                          <p className="whitespace-pre-wrap text-xs font-bold text-ctp-text">
                            {settings.receiptHeader || "STORE NAME"}
                          </p>
                          <div className="my-3 border-t border-dashed border-ctp-surface1" />
                          <div className="space-y-2 text-left text-[11px] text-ctp-subtext0">
                            <div className="flex justify-between gap-3">
                              <span>Sample motorcycle part</span>
                              <span className="shrink-0">{currencyPreview}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Tax rate</span>
                              <span>{settings.taxRate || "0"}%</span>
                            </div>
                          </div>
                          <div className="my-3 border-t border-dashed border-ctp-surface1" />
                          <p className="whitespace-pre-wrap text-[11px] text-ctp-text">
                            {settings.receiptFooter}
                          </p>
                          {settings.receiptNotes && (
                            <p className="mt-2 whitespace-pre-wrap text-[10px] leading-relaxed text-ctp-subtext0">
                              {settings.receiptNotes}
                            </p>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {section.id === "permissions" && (
                    <>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {section.fields.map(renderField)}
                      </div>
                      <div className="flex items-start gap-2 rounded-lg border border-ctp-blue/20 bg-ctp-blue/5 p-3">
                        <LockKeyhole size={15} className="mt-0.5 shrink-0 text-ctp-blue" />
                        <p className="text-xs leading-relaxed text-ctp-subtext0">
                          The backend must enforce discount limits and authorization. UI settings alone cannot secure sales actions.
                        </p>
                      </div>
                    </>
                  )}

                  {section.id === "server" && (
                    <>
                      <div className="flex items-start gap-2 rounded-lg border border-ctp-yellow/25 bg-ctp-yellow/5 p-3">
                        <CircleAlert size={15} className="mt-0.5 shrink-0 text-ctp-yellow" />
                        <p className="text-xs leading-relaxed text-ctp-subtext0">
                          These values are previews. Validate them on the server and apply network changes through a controlled restart.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {section.fields.map(renderField)}
                      </div>
                      {settings.listenAddress === "0.0.0.0" && (
                        <div className="flex items-start gap-2 rounded-lg border border-ctp-blue/20 bg-ctp-blue/5 p-3">
                          <Network size={15} className="mt-0.5 shrink-0 text-ctp-blue" />
                          <p className="text-xs leading-relaxed text-ctp-subtext0">
                            Binding to all interfaces may expose the API to other devices on the network. Restrict access to trusted devices and protect administrative routes.
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {section.id === "backups" && (
                    <>
                      {section.fields.map(renderField)}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
                          <div className="mb-1.5 flex items-center gap-2">
                            <Database size={15} className="text-ctp-mauve" />
                            <p className="text-xs font-medium text-ctp-text">
                              Backup destination
                            </p>
                          </div>
                          <p className="text-xs leading-relaxed text-ctp-subtext0">
                            Local server storage. The backend must configure the path, retention, and integrity checks.
                          </p>
                        </div>
                        <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
                          <div className="mb-1.5 flex items-center gap-2">
                            <Clock size={15} className="text-ctp-mauve" />
                            <p className="text-xs font-medium text-ctp-text">
                              Backup status
                            </p>
                          </div>
                          <p className="text-xs leading-relaxed text-ctp-subtext0">
                            <span className="font-medium text-ctp-yellow">
                              Not configured
                            </span>
                            {" "}— changing the schedule does not create a backup yet.
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {section.id === "diagnostics" && (
                    <>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {section.fields.map(renderField)}
                      </div>
                      <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
                        <div className="flex items-start gap-2">
                          <Activity size={16} className="mt-0.5 shrink-0 text-ctp-green" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-ctp-text">
                              Configuration preview
                            </p>
                            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-ctp-subtext0">
                                  Log level
                                </p>
                                <p className="mt-1 font-mono text-sm font-semibold text-ctp-blue">
                                  {settings.logLevel}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-ctp-subtext0">
                                  Buffer limit
                                </p>
                                <p className="mt-1 text-sm font-semibold text-ctp-text">
                                  {Number(settings.consoleBufferLines).toLocaleString()} lines
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] uppercase tracking-wide text-ctp-subtext0">
                                  Status
                                </p>
                                <p className="mt-1 text-sm font-semibold text-ctp-yellow">
                                  Preview only
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {section.id === "security" && (
                    <ul className="space-y-3 text-xs leading-relaxed text-ctp-subtext0">
                      <li className="flex gap-2">
                        <span className="text-ctp-mauve">•</span>
                        <span>Validate settings on the backend and enforce critical policies during transactions.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-ctp-mauve">•</span>
                        <span>Never store supervisor PINs or credentials as plaintext settings.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-ctp-mauve">•</span>
                        <span>Use idempotent transaction IDs and conflict handling for offline queues.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-ctp-mauve">•</span>
                        <span>Audit server-side configuration changes. Apply sensitive network changes through a controlled restart.</span>
                      </li>
                    </ul>
                  )}
                </Section>
              );
            })
          )}
        </main>
      </div>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-ctp-surface0 bg-ctp-base/95 px-3 py-2.5 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {showSaveNotice ? (
              <div className="flex items-start gap-2 text-xs text-ctp-yellow">
                <Info size={14} className="mt-0.5 shrink-0" />
                <span>{noticeMessage}</span>
              </div>
            ) : hasChanges ? (
              <div className="flex items-center gap-2 text-xs text-ctp-yellow">
                <span className="size-2 shrink-0 rounded-full bg-ctp-yellow" />
                Unsaved changes
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-ctp-subtext0">
                <Check size={14} className="text-ctp-green" />
                No unsaved changes
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={restoreSavedSettings}
              disabled={!hasChanges}
              className="flex items-center gap-1.5 rounded-lg border border-ctp-surface1 px-3 py-2 text-xs font-medium text-ctp-subtext1 transition hover:bg-ctp-surface0 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw size={14} />
              <span className="hidden sm:inline">Discard</span>
            </button>

            <button
              type="button"
              onClick={resetSettings}
              className="rounded-lg border border-ctp-surface1 px-3 py-2 text-xs font-medium text-ctp-subtext1 transition hover:bg-ctp-surface0"
            >
              Reset defaults
            </button>

            <button
              type="button"
              onClick={saveSettings}
              disabled={!hasChanges}
              className="flex items-center gap-1.5 rounded-lg bg-ctp-mauve px-3.5 py-2 text-xs font-semibold text-ctp-base transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save size={14} />
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
