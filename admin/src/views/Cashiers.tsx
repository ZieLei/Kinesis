
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { apiRequest } from "../lib/api";

type Cashier = {
  id: string;
  username: string;
  display_name: string;
  is_active: boolean;
  is_supervisor: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

type CashierListResponse = {
  items: Cashier[];
};

type CashierForm = {
  username: string;
  display_name: string;
  pin: string;
  is_supervisor: boolean;
};

const EMPTY_FORM: CashierForm = {
  username: "",
  display_name: "",
  pin: "",
  is_supervisor: false,
};

function formatDate(value: string | null): string {
  if (!value) return "Never";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Unknown"
    : date.toLocaleString();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "An unexpected error occurred.";
}

export default function Cashiers() {
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [creating, setCreating] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeResetId, setActiveResetId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const [form, setForm] = useState<CashierForm>(EMPTY_FORM);
  const [resetPin, setResetPin] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadCashiers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await apiRequest<CashierListResponse>(
        "/api/admin/cashiers",
        {
          method: "GET",
          cache: "no-store",
        },
      );

      setCashiers(response.items);
      setHasLoaded(true);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCashiers();
  }, [loadCashiers]);

  const handleCreateCashier = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (creating) return;

    const username = form.username.trim().toLowerCase();
    const displayName = form.display_name.trim();

    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/.test(username)) {
      setError(
        "Username must contain 3–64 characters and use letters, numbers, periods, underscores, or hyphens.",
      );
      return;
    }

    if (!displayName) {
      setError("Enter the cashier's display name.");
      return;
    }

    if (!/^\d{6}$/.test(form.pin)) {
      setError("The cashier PIN must contain exactly six digits.");
      return;
    }

    setCreating(true);
    setError("");
    setNotice("");

    try {
      await apiRequest<Cashier>("/api/admin/cashiers", {
        method: "POST",
        body: JSON.stringify({
          username,
          display_name: displayName,
          pin: form.pin,
          is_supervisor: form.is_supervisor,
        }),
      });

      setForm(EMPTY_FORM);

      setNotice(
        form.is_supervisor
          ? `Supervisor account "${username}" was created.`
          : `Cashier account "${username}" was created.`,
      );

      await loadCashiers();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setCreating(false);
    }
  };

  const handleToggleAccount = async (cashier: Cashier) => {
    if (busyId || resettingId) return;

    const nextActive = !cashier.is_active;

    const confirmed = window.confirm(
      nextActive
        ? `Enable cashier account "${cashier.username}"?`
        : `Disable cashier account "${cashier.username}"? Existing sessions will be revoked.`,
    );

    if (!confirmed) return;

    setBusyId(cashier.id);
    setError("");
    setNotice("");

    try {
      await apiRequest(`/api/admin/cashiers/${cashier.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          is_active: nextActive,
        }),
      });

      setNotice(
        nextActive
          ? `Cashier "${cashier.username}" was enabled.`
          : `Cashier "${cashier.username}" was disabled and existing sessions were revoked.`,
      );

      await loadCashiers();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleSupervisor = async (cashier: Cashier) => {
    if (busyId || resettingId) return;

    if (!cashier.is_active && !cashier.is_supervisor) {
      setError("Enable this account before promoting it to supervisor.");
      return;
    }

    const nextSupervisor = !cashier.is_supervisor;

    const confirmed = window.confirm(
      nextSupervisor
        ? `Promote "${cashier.username}" to supervisor? This account will be able to authorize cashier discounts.`
        : `Remove supervisor privileges from "${cashier.username}"? This account will no longer be able to authorize discounts.`,
    );

    if (!confirmed) return;

    setBusyId(cashier.id);
    setError("");
    setNotice("");

    try {
      await apiRequest(`/api/admin/cashiers/${cashier.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          is_supervisor: nextSupervisor,
        }),
      });

      setNotice(
        nextSupervisor
          ? `"${cashier.username}" is now a supervisor.`
          : `Supervisor privileges were removed from "${cashier.username}".`,
      );

      await loadCashiers();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusyId(null);
    }
  };

  const handleResetPin = async (cashier: Cashier) => {
    if (
      resettingId ||
      busyId ||
      activeResetId !== cashier.id
    ) {
      return;
    }

    if (!/^\d{6}$/.test(resetPin)) {
      setError("Enter a new six-digit PIN.");
      return;
    }

    const confirmed = window.confirm(
      `Reset the PIN for "${cashier.username}"? All existing sessions for this cashier will be revoked.`,
    );

    if (!confirmed) return;

    setResettingId(cashier.id);
    setError("");
    setNotice("");

    try {
      await apiRequest(
        `/api/admin/cashiers/${cashier.id}/reset-pin`,
        {
          method: "POST",
          body: JSON.stringify({
            pin: resetPin,
          }),
        },
      );

      setNotice(
        `PIN reset successfully for "${cashier.username}". Existing sessions were revoked.`,
      );

      setResetPin("");
      setActiveResetId(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setResettingId(null);
    }
  };

  const activeCount = cashiers.filter(
    (cashier) => cashier.is_active,
  ).length;

  const supervisorCount = cashiers.filter(
    (cashier) => cashier.is_active && cashier.is_supervisor,
  ).length;

  const isMutating = busyId !== null || resettingId !== null;
  const showInitialLoading = loading && !hasLoaded;

  return (
    <section className="space-y-4" aria-busy={showInitialLoading}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ctp-text">
            Cashier Management
          </h2>
          <p className="mt-1 text-sm text-ctp-subtext0">
            Create employee accounts, manage supervisor access, and reset PINs.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadCashiers()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm font-medium text-ctp-text transition hover:bg-ctp-surface0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            size={15}
            className={loading ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-ctp-surface1 bg-ctp-mantle p-3">
          <div className="flex items-center gap-2 text-ctp-subtext0">
            <UserRound size={16} />
            <span className="text-xs font-medium">Total cashiers</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ctp-text">
            {hasLoaded ? cashiers.length : "—"}
          </p>
        </div>

        <div className="rounded-xl border border-ctp-surface1 bg-ctp-mantle p-3">
          <div className="flex items-center gap-2 text-ctp-green">
            <ShieldCheck size={16} />
            <span className="text-xs font-medium">Active accounts</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ctp-text">
            {hasLoaded ? activeCount : "—"}
          </p>
        </div>

        <div className="rounded-xl border border-ctp-surface1 bg-ctp-mantle p-3">
          <div className="flex items-center gap-2 text-ctp-blue">
            <ShieldCheck size={16} />
            <span className="text-xs font-medium">Active supervisors</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ctp-text">
            {hasLoaded ? supervisorCount : "—"}
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-ctp-red/30 bg-ctp-red/10 px-3 py-2.5 text-sm text-ctp-red"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-ctp-green/30 bg-ctp-green/10 px-3 py-2.5 text-sm text-ctp-green"
        >
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <div className="rounded-xl border border-ctp-surface1 bg-ctp-mantle p-4">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ctp-blue/10 text-ctp-blue">
            <Plus size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ctp-text">
              Create cashier account
            </h3>
            <p className="mt-0.5 text-xs text-ctp-subtext0">
              Cashiers use their username and six-digit PIN on POS terminals.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleCreateCashier}
          className="grid gap-3 md:grid-cols-4"
        >
          <label className="min-w-0 space-y-1.5">
            <span className="text-xs font-medium text-ctp-subtext1">
              Username
            </span>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={64}
              required
              value={form.username}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  username: event.target.value,
                }))
              }
              placeholder="e.g. cashier01"
              className="w-full rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-2 text-sm text-ctp-text outline-none transition placeholder:text-ctp-overlay1 focus:border-ctp-blue focus:ring-2 focus:ring-ctp-blue/20"
            />
          </label>

          <label className="min-w-0 space-y-1.5">
            <span className="text-xs font-medium text-ctp-subtext1">
              Display name
            </span>
            <input
              type="text"
              maxLength={100}
              required
              value={form.display_name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  display_name: event.target.value,
                }))
              }
              placeholder="e.g. Alex"
              className="w-full rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-2 text-sm text-ctp-text outline-none transition placeholder:text-ctp-overlay1 focus:border-ctp-blue focus:ring-2 focus:ring-ctp-blue/20"
            />
          </label>

          <label className="min-w-0 space-y-1.5">
            <span className="text-xs font-medium text-ctp-subtext1">
              Six-digit PIN
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              pattern="[0-9]{6}"
              required
              value={form.pin}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  pin: event.target.value.replace(/\D/g, "").slice(0, 6),
                }))
              }
              placeholder="••••••"
              className="w-full rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-2 text-sm tracking-[0.35em] text-ctp-text outline-none transition placeholder:text-ctp-overlay1 focus:border-ctp-blue focus:ring-2 focus:ring-ctp-blue/20"
            />
          </label>

          <label className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-2.5">
            <input
              type="checkbox"
              checked={form.is_supervisor}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  is_supervisor: event.target.checked,
                }))
              }
              className="h-4 w-4 accent-[var(--ctp-blue)]"
            />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-ctp-text">
                Supervisor
              </span>
              <span className="block text-[10px] leading-4 text-ctp-subtext0">
                Can authorize discounts
              </span>
            </span>
          </label>

          <div className="md:col-span-4">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-ctp-blue px-3.5 py-2 text-sm font-semibold text-ctp-base transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <Plus size={15} />
              )}
              {creating ? "Creating account..." : "Create cashier"}
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-ctp-surface1 bg-ctp-mantle">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ctp-surface0 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-ctp-text">
              Cashier accounts
            </h3>
            <p className="mt-0.5 text-xs text-ctp-subtext0">
              Manage access, supervisor privileges, and employee PINs.
            </p>
          </div>

          <span className="rounded-md bg-ctp-surface0 px-2.5 py-1 text-xs tabular-nums text-ctp-subtext1">
            {hasLoaded ? `${cashiers.length} accounts` : "Loading"}
          </span>
        </div>

        {showInitialLoading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-ctp-subtext0">
            <LoaderCircle size={17} className="animate-spin" />
            Loading cashier accounts...
          </div>
        ) : !hasLoaded ? (
          <div className="px-4 py-10 text-center">
            <AlertCircle size={26} className="mx-auto text-ctp-red" />
            <p className="mt-2 text-sm font-medium text-ctp-text">
              Could not load cashier accounts
            </p>
            <p className="mt-1 text-xs text-ctp-subtext0">
              Check the connection and try again.
            </p>
            <button
              type="button"
              onClick={() => void loadCashiers()}
              disabled={loading}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-ctp-surface1 px-3 py-2 text-xs font-semibold text-ctp-text transition hover:bg-ctp-surface0 disabled:opacity-50"
            >
              <RefreshCw size={13} />
              Try again
            </button>
          </div>
        ) : cashiers.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <UserRound size={28} className="mx-auto text-ctp-overlay1" />
            <p className="mt-2 text-sm font-medium text-ctp-text">
              No cashier accounts yet
            </p>
            <p className="mt-1 text-xs text-ctp-subtext0">
              Create the first cashier account using the form above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-ctp-surface0">
            {cashiers.map((cashier) => (
              <article key={cashier.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ctp-surface0 text-ctp-text">
                      <UserRound size={17} />
                    </div>

                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold text-ctp-text">
                        {cashier.display_name}
                      </h4>
                      <p className="mt-0.5 truncate text-xs text-ctp-subtext0">
                        @{cashier.username}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {cashier.is_supervisor && (
                      <span className="rounded-full border border-ctp-blue/30 bg-ctp-blue/10 px-2.5 py-1 text-[11px] font-medium text-ctp-blue">
                        Supervisor
                      </span>
                    )}

                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${cashier.is_active
                        ? "border-ctp-green/30 bg-ctp-green/10 text-ctp-green"
                        : "border-ctp-surface1 bg-ctp-surface0 text-ctp-subtext0"
                        }`}
                    >
                      {cashier.is_active ? "Active" : "Disabled"}
                    </span>

                    <button
                      type="button"
                      onClick={() => void handleToggleAccount(cashier)}
                      disabled={isMutating || loading}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${cashier.is_active
                        ? "border-ctp-red/30 text-ctp-red hover:bg-ctp-red/10"
                        : "border-ctp-green/30 text-ctp-green hover:bg-ctp-green/10"
                        }`}
                    >
                      {busyId === cashier.id
                        ? "Saving..."
                        : cashier.is_active
                          ? "Disable"
                          : "Enable"}
                    </button>
                  </div>
                </div>

                <div className="grid gap-1.5 text-xs text-ctp-subtext0 sm:grid-cols-2">
                  <p>
                    <span className="text-ctp-subtext1">Created:</span>{" "}
                    {formatDate(cashier.created_at)}
                  </p>
                  <p>
                    <span className="text-ctp-subtext1">Last login:</span>{" "}
                    {formatDate(cashier.last_login_at)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ctp-surface0 bg-ctp-base px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck
                      size={15}
                      className={
                        cashier.is_supervisor
                          ? "text-ctp-blue"
                          : "text-ctp-overlay1"
                      }
                    />
                    <div>
                      <p className="text-xs font-semibold text-ctp-text">
                        {cashier.is_supervisor
                          ? "Supervisor privileges enabled"
                          : "Standard cashier"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ctp-subtext0">
                        {cashier.is_supervisor
                          ? "Can authorize discounts requiring approval."
                          : "Cannot authorize supervisor-only discounts."}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleToggleSupervisor(cashier)}
                    disabled={isMutating || loading || !cashier.is_active}
                    className="rounded-lg border border-ctp-surface1 px-3 py-1.5 text-xs font-semibold text-ctp-text transition hover:bg-ctp-surface0 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busyId === cashier.id
                      ? "Saving..."
                      : cashier.is_supervisor
                        ? "Remove supervisor"
                        : "Promote to supervisor"}
                  </button>
                </div>

                <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <KeyRound size={14} className="text-ctp-subtext0" />
                    <span className="text-xs font-semibold text-ctp-text">
                      Reset PIN
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      aria-label={`New PIN for ${cashier.username}`}
                      placeholder="New six-digit PIN"
                      value={
                        activeResetId === cashier.id
                          ? resetPin
                          : ""
                      }
                      onFocus={() => {
                        setActiveResetId(cashier.id);
                        setResetPin("");
                      }}
                      onChange={(event) => {
                        setActiveResetId(cashier.id);
                        setResetPin(
                          event.target.value
                            .replace(/\D/g, "")
                            .slice(0, 6),
                        );
                      }}
                      disabled={isMutating}
                      className="min-w-0 flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm tracking-[0.3em] text-ctp-text outline-none placeholder:tracking-normal placeholder:text-ctp-overlay1 focus:border-ctp-blue focus:ring-2 focus:ring-ctp-blue/20 disabled:cursor-not-allowed disabled:opacity-50"
                    />

                    <button
                      type="button"
                      onClick={() => void handleResetPin(cashier)}
                      disabled={
                        isMutating ||
                        activeResetId !== cashier.id ||
                        !/^\d{6}$/.test(resetPin)
                      }
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-ctp-surface1 px-3 py-2 text-xs font-semibold text-ctp-text transition hover:bg-ctp-surface0 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {resettingId === cashier.id ? (
                        <LoaderCircle
                          size={13}
                          className="animate-spin"
                        />
                      ) : (
                        <KeyRound size={13} />
                      )}
                      Reset PIN
                    </button>
                  </div>

                  <p className="mt-2 text-[11px] leading-4 text-ctp-subtext0">
                    Resetting a PIN revokes all existing sessions for this cashier.
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
