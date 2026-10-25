import { useState } from "react";
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
  FileText,
  LockKeyhole,
  Wifi,
  SlidersHorizontal,
  ScanBarcode,
  HardDrive,
  Activity,
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
  "w-full rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2.5 text-sm text-ctp-text outline-none transition placeholder:text-ctp-overlay0 focus:border-ctp-mauve focus:ring-2 focus:ring-ctp-mauve/15";

const selectClass =
  "w-full appearance-none rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2.5 pr-9 text-sm text-ctp-text outline-none transition focus:border-ctp-mauve focus:ring-2 focus:ring-ctp-mauve/15";

const labelClass = "mb-1.5 block text-sm font-medium text-ctp-text";

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label className={labelClass}>{label}</label>
      {children}
      {description && (
        <p className="mt-1.5 text-xs leading-relaxed text-ctp-subtext0">
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
  options: { label: string; value: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        className={`${selectClass} ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
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
        size={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ctp-subtext0"
      />
    </div>
  );
}

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
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors duration-200 ${checked ? "bg-ctp-mauve" : "bg-ctp-surface1"
        }`}
    >
      <span
        className={`pointer-events-none absolute left-1 top-1 size-4 rounded-full bg-ctp-base shadow-sm transition-transform duration-200 ${checked ? "translate-x-5" : "translate-x-0"
          }`}
      />
    </button>
  );
}

function ToggleRow({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-ctp-surface0 p-2 text-ctp-subtext1">
          <Icon size={17} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ctp-text">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ctp-subtext0">
            {description}
          </p>
        </div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
  badge,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-ctp-surface0 bg-ctp-mantle">
      <div className="flex items-start gap-3 border-b border-ctp-surface0 px-5 py-4 sm:px-6">
        <div className="rounded-lg border border-ctp-surface1 bg-ctp-base p-2 text-ctp-mauve">
          <Icon size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-inter text-base font-semibold text-ctp-text">
            {title}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ctp-subtext0">
            {description}
          </p>
        </div>
        {badge && (
          <span className="shrink-0 rounded-md bg-ctp-surface0 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ctp-subtext1">
            {badge}
          </span>
        )}
      </div>
      <div className="space-y-5 p-5 sm:p-6">{children}</div>
    </section>
  );
}

export default function Settings() {
  const [settings, setSettings] =
    useState<SettingsState>(defaultSettings);
  const [savedSettings, setSavedSettings] =
    useState<SettingsState>(defaultSettings);
  const [showSaveNotice, setShowSaveNotice] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");

  const update = <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setShowSaveNotice(false);
  };

  const hasChanges =
    JSON.stringify(settings) !== JSON.stringify(savedSettings);

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
    const year = settings.skuIncludeYear ? `${new Date().getFullYear()}-` : "";

    if (settings.skuFormat === "prefix-sequence") {
      return `${settings.skuPrefix}-${year}${sequence}`;
    }

    if (settings.skuFormat === "sequence-only") {
      return `${year}${sequence}`;
    }

    return `${settings.skuPrefix}-${year}PART-${sequence}`;
  })();

  const saveSettings = () => {
    // UI preview only: replace this with a PUT/PATCH request to the backend.
    setSavedSettings({ ...settings });
    setNoticeMessage(
      "Settings marked as saved in this page. They have not been persisted to the server or sent to terminals.",
    );
    setShowSaveNotice(true);
  };

  const resetSettings = () => {
    setSettings({ ...defaultSettings });
    setShowSaveNotice(false);
    setNoticeMessage("Defaults restored in this page. Save to update the preview state.");
  };

  const restoreSavedSettings = () => {
    setSettings({ ...savedSettings });
    setShowSaveNotice(false);
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] pb-28 font-inter">
      {/* Page heading */}
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-ctp-subtext0">
            <Settings2 size={14} />
            <span>ADMINISTRATION</span>
            <span className="text-ctp-overlay0">/</span>
            <span className="text-ctp-mauve">SETTINGS</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ctp-text">
            System settings
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ctp-subtext0">
            Manage global POS policies, inventory behavior, receipts,
            permissions, and the laptop server configuration.
          </p>
        </div>

        <div className="flex w-fit items-center gap-2 rounded-lg border border-ctp-yellow/25 bg-ctp-yellow/10 px-3 py-2">
          <CircleAlert size={16} className="shrink-0 text-ctp-yellow" />
          <div>
            <p className="text-xs font-semibold text-ctp-yellow">
              Backend not connected
            </p>
            <p className="mt-0.5 text-[10px] text-ctp-subtext0">
              Local UI preview only
            </p>
          </div>
        </div>
      </div>

      {/* Preview notice */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-ctp-blue/20 bg-ctp-blue/5 p-4">
        <Info size={18} className="mt-0.5 shrink-0 text-ctp-blue" />
        <div>
          <p className="text-sm font-medium text-ctp-text">
            One source of truth for all terminals
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ctp-subtext0">
            These controls are designed for the laptop server to own the
            authoritative configuration. Connected terminals should retrieve
            the settings from the server and apply them consistently. This
            screen currently does not persist changes or distribute settings.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* POS & Store policies */}
        <Section
          icon={Store}
          title="POS & Store policies"
          description="Global formatting and transaction rules followed by every terminal."
          badge="Global"
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field
              label="Currency symbol"
              description="The symbol shown on prices, totals, and receipts."
            >
              <SelectField
                value={settings.currencySymbol}
                onChange={(v) => update("currencySymbol", v)}
                options={[
                  { label: "₱ — Philippine peso", value: "₱" },
                  { label: "$ — Dollar", value: "$" },
                  { label: "¥ — Yen / Yuan", value: "¥" },
                  { label: "€ — Euro", value: "€" },
                  { label: "£ — Pound sterling", value: "£" },
                  { label: "฿ — Thai baht", value: "฿" },
                  { label: "₹ — Indian rupee", value: "₹" },
                ]}
              />
            </Field>

            <Field label="Currency placement">
              <SelectField
                value={settings.currencyPlacement}
                onChange={(v) =>
                  update("currencyPlacement", v as SettingsState["currencyPlacement"])
                }
                options={[
                  { label: "Before amount — ₱ 1,234.50", value: "before" },
                  { label: "After amount — 1,234.50 ₱", value: "after" },
                ]}
              />
            </Field>

            <Field
              label="Decimal precision"
              description="Number of decimal places used when displaying monetary amounts."
            >
              <SelectField
                value={settings.decimalPrecision}
                onChange={(v) => update("decimalPrecision", v)}
                options={[
                  { label: "0 decimal places", value: "0" },
                  { label: "2 decimal places", value: "2" },
                  { label: "3 decimal places", value: "3" },
                ]}
              />
            </Field>

            <Field
              label="Cash change rounding"
              description="Rounding increment for cash payments. Card and digital payments should retain their exact calculated totals."
            >
              <SelectField
                value={settings.cashRounding}
                onChange={(v) => update("cashRounding", v)}
                options={[
                  { label: "No rounding — ₱0.01", value: "0.01" },
                  { label: "Nearest ₱0.05", value: "0.05" },
                  { label: "Nearest ₱0.10", value: "0.10" },
                  { label: "Nearest ₱1.00", value: "1.00" },
                ]}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
            <div className="flex items-center gap-2 text-ctp-subtext0">
              <PhilippinePeso size={17} />
              <span className="text-xs">Live formatting preview</span>
            </div>
            <span className="font-inter text-lg font-semibold tabular-nums text-ctp-green">
              {currencyPreview}
            </span>
          </div>
        </Section>

        {/* Inventory */}
        <Section
          icon={Package}
          title="Inventory & SKU generation"
          description="Control stock warnings, exceptional stock behavior, and generated part identifiers."
        >
          <Field
            label="Global low-stock threshold"
            description="Products at or below this quantity are flagged as low stock."
          >
            <div className="flex items-center gap-3">
              <input
                className={`${inputClass} max-w-[180px]`}
                type="number"
                min="0"
                step="1"
                value={settings.lowStockThreshold}
                onChange={(e) => update("lowStockThreshold", e.target.value)}
              />
              <span className="text-sm text-ctp-subtext0">units remaining</span>
            </div>
          </Field>

          <div className="divide-y divide-ctp-surface0">
            <ToggleRow
              icon={CircleAlert}
              title="Allow negative inventory"
              description="Allow a sale to reduce stock below zero during rush periods. Stock discrepancies must be reconciled during audits."
              checked={settings.allowNegativeInventory}
              onChange={(v) => update("allowNegativeInventory", v)}
            />
          </div>

          {settings.allowNegativeInventory && (
            <div className="flex items-start gap-2 rounded-lg border border-ctp-yellow/25 bg-ctp-yellow/5 p-3">
              <CircleAlert size={16} className="mt-0.5 shrink-0 text-ctp-yellow" />
              <p className="text-xs leading-relaxed text-ctp-subtext0">
                Negative stock can hide inventory errors and allow sales of
                unavailable parts. Consider requiring a reason and logging the
                cashier and transaction for every negative-stock sale.
              </p>
            </div>
          )}

          <div className="border-t border-ctp-surface0 pt-5">
            <div className="mb-4 flex items-center gap-2">
              <ScanBarcode size={17} className="text-ctp-mauve" />
              <h3 className="text-sm font-semibold text-ctp-text">
                Automatic SKU format
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="SKU format">
                <SelectField
                  value={settings.skuFormat}
                  onChange={(v) => update("skuFormat", v)}
                  options={[
                    { label: "Prefix + sequence", value: "prefix-sequence" },
                    { label: "Sequence only", value: "sequence-only" },
                    { label: "Prefix + PART + sequence", value: "prefix-part-sequence" },
                  ]}
                />
              </Field>

              <Field label="SKU prefix">
                <input
                  className={inputClass}
                  maxLength={12}
                  value={settings.skuPrefix}
                  disabled={settings.skuFormat === "sequence-only"}
                  onChange={(e) =>
                    update("skuPrefix", e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))
                  }
                  placeholder="KNS"
                />
              </Field>

              <Field label="Sequence digits">
                <SelectField
                  value={settings.skuDigits}
                  onChange={(v) => update("skuDigits", v)}
                  options={[
                    { label: "4 digits — 0001", value: "4" },
                    { label: "5 digits — 00001", value: "5" },
                    { label: "6 digits — 000001", value: "6" },
                    { label: "8 digits — 00000001", value: "8" },
                  ]}
                />
              </Field>

              <div className="flex items-center justify-between gap-4 rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
                <div>
                  <p className="text-sm font-medium text-ctp-text">
                    Include year
                  </p>
                  <p className="mt-1 text-xs text-ctp-subtext0">
                    Add the current year to generated SKUs.
                  </p>
                </div>
                <Toggle
                  checked={settings.skuIncludeYear}
                  onChange={(v) => update("skuIncludeYear", v)}
                />
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
              <p className="mb-2 text-xs text-ctp-subtext0">
                Example of the next generated SKU
              </p>
              <code className="text-sm font-semibold tracking-wide text-ctp-green">
                {skuPreview}
              </code>
              <p className="mt-2 text-[11px] leading-relaxed text-ctp-subtext0">
                Preview only. The backend must generate unique identifiers
                atomically to prevent duplicate SKUs when multiple terminals
                add products.
              </p>
            </div>
          </div>
        </Section>

        {/* Tax and receipts */}
        <Section
          icon={Receipt}
          title="Tax & receipt customization"
          description="Configure transaction tax and the content and delivery format of receipts."
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field
              label="Tax rate (%)"
              description="Applied by the server to taxable items. Confirm the appropriate rate and exemptions for your business."
            >
              <div className="relative">
                <input
                  className={`${inputClass} pr-9`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={settings.taxRate}
                  onChange={(e) => update("taxRate", e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ctp-subtext0">
                  %
                </span>
              </div>
            </Field>

            <Field
              label="Default receipt output"
              description="The default destination selected when a cashier completes a sale."
            >
              <SelectField
                value={settings.receiptOutput}
                onChange={(v) =>
                  update("receiptOutput", v as SettingsState["receiptOutput"])
                }
                options={[
                  { label: "Bluetooth thermal printer", value: "bluetooth" },
                  { label: "SMS receipt", value: "sms" },
                  { label: "QR code receipt", value: "qr" },
                ]}
              />
            </Field>
          </div>

          <div className="divide-y divide-ctp-surface0">
            <ToggleRow
              icon={Smartphone}
              title="Enable digital receipts"
              description="Allow cashiers to issue receipts electronically using the selected delivery method."
              checked={settings.digitalReceipts}
              onChange={(v) => update("digitalReceipts", v)}
            />
          </div>

          <div className="grid grid-cols-1 gap-5">
            <Field
              label="Receipt header"
              description="Store name and optional contact details printed at the top."
            >
              <textarea
                className={`${inputClass} min-h-20 resize-y`}
                maxLength={500}
                value={settings.receiptHeader}
                onChange={(e) => update("receiptHeader", e.target.value)}
                rows={2}
              />
            </Field>

            <Field
              label="Receipt footer"
              description="Closing message printed after the transaction details."
            >
              <textarea
                className={`${inputClass} min-h-16 resize-y`}
                maxLength={500}
                value={settings.receiptFooter}
                onChange={(e) => update("receiptFooter", e.target.value)}
                rows={2}
              />
            </Field>

            <Field
              label="Custom receipt notes"
              description="Return policy, warranty disclaimer, or other store-specific notes."
            >
              <textarea
                className={`${inputClass} min-h-20 resize-y`}
                maxLength={1000}
                value={settings.receiptNotes}
                onChange={(e) => update("receiptNotes", e.target.value)}
                rows={3}
              />
            </Field>
          </div>

          <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
            <div className="mb-3 flex items-center gap-2">
              <Printer size={16} className="text-ctp-mauve" />
              <p className="text-xs font-semibold text-ctp-text">
                Receipt preview
              </p>
            </div>
            <div className="mx-auto max-w-xs border border-dashed border-ctp-surface1 bg-ctp-mantle p-5 text-center">
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
        </Section>

        {/* Permissions */}
        <Section
          icon={ShieldCheck}
          title="Cashier & sales permissions"
          description="Set the safeguards that apply to sales actions on all POS terminals."
          badge="Access control"
        >
          <div className="divide-y divide-ctp-surface0">
            <ToggleRow
              icon={LockKeyhole}
              title="Supervisor PIN for discounts"
              description="Require supervisor authorization before a cashier can apply a discount."
              checked={settings.supervisorPinForDiscounts}
              onChange={(v) => update("supervisorPinForDiscounts", v)}
            />

            <ToggleRow
              icon={SlidersHorizontal}
              title="Allow custom line items"
              description="Let cashiers add manually priced services, such as labor charges, to a sale."
              checked={settings.allowCustomLineItems}
              onChange={(v) => update("allowCustomLineItems", v)}
            />
          </div>

          <Field
            label="Maximum cashier discount (%)"
            description="Discounts above this percentage should require supervisor approval. This limit is a policy setting, not a replacement for server-side authorization."
          >
            <div className="relative max-w-xs">
              <input
                className={`${inputClass} pr-9`}
                type="number"
                min="0"
                max="100"
                step="1"
                value={settings.discountLimit}
                onChange={(e) => update("discountLimit", e.target.value)}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ctp-subtext0">
                %
              </span>
            </div>
          </Field>

          <Field
            label="POS inactivity auto-lock"
            description="After this period without activity, the terminal should return to its PIN lock screen. The server should not need to interrupt an active transaction."
          >
            <SelectField
              value={settings.inactivityLock}
              onChange={(v) => update("inactivityLock", v)}
              options={[
                { label: "5 minutes", value: "5" },
                { label: "10 minutes", value: "10" },
                { label: "15 minutes", value: "15" },
                { label: "30 minutes", value: "30" },
                { label: "60 minutes", value: "60" },
                { label: "Disabled", value: "disabled" },
              ]}
            />
          </Field>
        </Section>

        {/* Server & node engine */}
        <Section
          icon={Server}
          title="Server & network"
          description="Runtime configuration for the laptop-hosted API and connected mobile terminals."
          badge="Backend"
        >
          <div className="flex items-start gap-3 rounded-lg border border-ctp-yellow/25 bg-ctp-yellow/5 p-3">
            <CircleAlert size={17} className="mt-0.5 shrink-0 text-ctp-yellow" />
            <div>
              <p className="text-sm font-medium text-ctp-text">
                Restart and network changes require care
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ctp-subtext0">
                These values are configuration previews only. When implemented,
                validate them on the server, protect administrative endpoints,
                and apply network changes through a controlled restart.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field
              label="Listen address"
              description="The network interface the API binds to."
            >
              <SelectField
                value={settings.listenAddress}
                onChange={(v) => update("listenAddress", v)}
                options={[
                  { label: "0.0.0.0 — All interfaces", value: "0.0.0.0" },
                  { label: "127.0.0.1 — Localhost only", value: "127.0.0.1" },
                ]}
              />
            </Field>

            <Field
              label="HTTP port"
              description="Port used by the backend API and WebSocket endpoint."
            >
              <input
                className={inputClass}
                type="number"
                min="1"
                max="65535"
                value={settings.httpPort}
                onChange={(e) => update("httpPort", e.target.value)}
              />
            </Field>

            <Field
              label="WebSocket heartbeat interval"
              description="Interval between heartbeat messages used to detect disconnected terminals."
            >
              <div className="relative">
                <input
                  className={`${inputClass} pr-16`}
                  type="number"
                  min="5"
                  max="300"
                  value={settings.websocketHeartbeat}
                  onChange={(e) => update("websocketHeartbeat", e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ctp-subtext0">
                  seconds
                </span>
              </div>
            </Field>

            <Field
              label="Offline queue strategy"
              description="Controls how pending terminal operations are handled during temporary network outages."
            >
              <SelectField
                value={settings.offlineQueueStrategy}
                onChange={(v) => update("offlineQueueStrategy", v)}
                options={[
                  { label: "Queue and retry", value: "queue-and-retry" },
                  { label: "Queue; manual reconciliation", value: "manual-reconciliation" },
                  { label: "Reject operations when offline", value: "reject-offline" },
                ]}
              />
            </Field>
          </div>

          <Field
            label="CORS allowed origins"
            description="One origin per line, including scheme and port. Avoid wildcards for production deployments with credentials."
          >
            <textarea
              className={`${inputClass} min-h-24 resize-y font-mono text-xs`}
              value={settings.corsOrigins}
              onChange={(e) => update("corsOrigins", e.target.value)}
              rows={3}
              placeholder={"http://localhost:5173\nhttp://192.168.1.10:5173"}
            />
          </Field>

          {settings.listenAddress === "0.0.0.0" && (
            <div className="flex items-start gap-2 rounded-lg border border-ctp-blue/20 bg-ctp-blue/5 p-3">
              <Network size={16} className="mt-0.5 shrink-0 text-ctp-blue" />
              <p className="text-xs leading-relaxed text-ctp-subtext0">
                Binding to all interfaces makes the service reachable through
                available network interfaces, subject to firewall and network
                rules. Restrict access to the trusted LAN and protect admin
                routes with authentication.
              </p>
            </div>
          )}
        </Section>

        {/* Backups */}
        <Section
          icon={HardDrive}
          title="Database backups"
          description="Define when automatic backups should run. Backup execution and retention will be handled by the backend."
        >
          <Field
            label="Automatic backup schedule"
            description="The server should create a recoverable backup at the selected interval."
          >
            <SelectField
              value={settings.backupSchedule}
              onChange={(v) => update("backupSchedule", v)}
              options={[
                { label: "Every 6 hours", value: "every-6-hours" },
                { label: "Every 12 hours", value: "every-12-hours" },
                { label: "Daily", value: "daily" },
                { label: "Weekly", value: "weekly" },
                { label: "Manual only", value: "manual" },
              ]}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
              <div className="mb-2 flex items-center gap-2 text-ctp-mauve">
                <Database size={17} />
                <p className="text-sm font-medium text-ctp-text">
                  Backup destination
                </p>
              </div>
              <p className="text-xs leading-relaxed text-ctp-subtext0">
                Local server storage. Destination path, retention, and backup
                integrity checks must be configured in the backend.
              </p>
            </div>

            <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
              <div className="mb-2 flex items-center gap-2 text-ctp-mauve">
                <Clock size={17} />
                <p className="text-sm font-medium text-ctp-text">
                  Schedule status
                </p>
              </div>
              <p className="text-xs leading-relaxed text-ctp-subtext0">
                <span className="font-medium text-ctp-yellow">
                  Not configured
                </span>
                {" "}— changing the selection here does not create backups yet.
              </p>
            </div>
          </div>
        </Section>

        {/* Logs and diagnostics */}
        <Section
          icon={Terminal}
          title="Logs & diagnostics"
          description="Configure diagnostic verbosity and memory usage for the web admin console."
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field
              label="System log level"
              description="Choose the minimum severity recorded by the backend logger."
            >
              <SelectField
                value={settings.logLevel}
                onChange={(v) => update("logLevel", v)}
                options={[
                  { label: "DEBUG — Detailed diagnostics", value: "DEBUG" },
                  { label: "INFO — Normal operation", value: "INFO" },
                  { label: "WARNING — Potential issues", value: "WARNING" },
                  { label: "ERROR — Failures only", value: "ERROR" },
                  { label: "CRITICAL — Severe failures", value: "CRITICAL" },
                ]}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { label: "DEBUG", cls: "bg-ctp-overlay0/15 text-ctp-subtext1" },
                  { label: "INFO", cls: "bg-ctp-blue/15 text-ctp-blue" },
                  { label: "WARNING", cls: "bg-ctp-yellow/15 text-ctp-yellow" },
                  { label: "ERROR", cls: "bg-ctp-red/15 text-ctp-red" },
                  { label: "CRITICAL", cls: "bg-ctp-maroon/15 text-ctp-maroon" },
                ].map((level) => (
                  <span
                    key={level.label}
                    className={`rounded-md px-2 py-1 font-mono text-[10px] font-semibold ${level.cls}`}
                  >
                    {level.label}
                  </span>
                ))}
              </div>
            </Field>

            <Field
              label="Console buffer retention"
              description="Maximum number of log lines retained in the admin web panel's in-memory console buffer."
            >
              <SelectField
                value={settings.consoleBufferLines}
                onChange={(v) => update("consoleBufferLines", v)}
                options={[
                  { label: "250 lines", value: "250" },
                  { label: "500 lines", value: "500" },
                  { label: "1,000 lines", value: "1000" },
                  { label: "2,500 lines", value: "2500" },
                  { label: "5,000 lines", value: "5000" },
                  { label: "10,000 lines", value: "10000" },
                ]}
              />
            </Field>
          </div>

          <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-4">
            <div className="flex items-start gap-3">
              <Activity size={17} className="mt-0.5 shrink-0 text-ctp-green" />
              <div>
                <p className="text-sm font-medium text-ctp-text">
                  Diagnostic configuration preview
                </p>
                <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-ctp-subtext0">
                      Log level
                    </p>
                    <p className="mt-1 font-mono text-sm font-semibold text-ctp-blue">
                      {settings.logLevel}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-ctp-subtext0">
                      Buffer limit
                    </p>
                    <p className="mt-1 font-mono text-sm font-semibold text-ctp-text">
                      {Number(settings.consoleBufferLines).toLocaleString()} lines
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-ctp-subtext0">
                      Console status
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ctp-yellow">
                      Preview only
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* Scope and security */}
        <section className="rounded-xl border border-ctp-surface0 bg-ctp-base p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <LockKeyhole size={19} className="mt-0.5 shrink-0 text-ctp-mauve" />
            <div>
              <h2 className="text-sm font-semibold text-ctp-text">
                Configuration and security notes
              </h2>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-ctp-subtext0">
                <li>
                  <span className="mr-2 text-ctp-mauve">•</span>
                  The backend must validate settings before accepting them and
                  enforce critical policies during transactions.
                </li>
                <li>
                  <span className="mr-2 text-ctp-mauve">•</span>
                  Supervisor PINs and credentials must never be stored as
                  plaintext settings or sent to terminals unnecessarily.
                </li>
                <li>
                  <span className="mr-2 text-ctp-mauve">•</span>
                  Offline queues need idempotent transaction IDs and conflict
                  handling to avoid duplicate sales or stock changes.
                </li>
                <li>
                  <span className="mr-2 text-ctp-mauve">•</span>
                  Server-side configuration changes should be audited, and
                  sensitive network changes may require a controlled restart.
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-ctp-surface0 bg-ctp-base/95 px-4 py-3 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {showSaveNotice ? (
              <div className="flex items-center gap-2 text-xs text-ctp-yellow">
                <Info size={15} className="shrink-0" />
                <span>{noticeMessage}</span>
              </div>
            ) : hasChanges ? (
              <div className="flex items-center gap-2 text-xs text-ctp-yellow">
                <span className="h-2 w-2 rounded-full bg-ctp-yellow" />
                Unsaved changes
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-ctp-subtext0">
                <Check size={15} className="text-ctp-green" />
                No unsaved changes
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={restoreSavedSettings}
              disabled={!hasChanges}
              className="flex items-center gap-2 rounded-lg border border-ctp-surface1 px-3 py-2 text-sm font-medium text-ctp-subtext1 transition hover:bg-ctp-surface0 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw size={15} />
              <span className="hidden sm:inline">Discard</span>
            </button>

            <button
              type="button"
              onClick={resetSettings}
              className="rounded-lg border border-ctp-surface1 px-3 py-2 text-sm font-medium text-ctp-subtext1 transition hover:bg-ctp-surface0"
            >
              Reset defaults
            </button>

            <button
              type="button"
              onClick={saveSettings}
              disabled={!hasChanges}
              className="flex items-center gap-2 rounded-lg bg-ctp-mauve px-4 py-2 text-sm font-semibold text-ctp-base transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save size={15} />
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
