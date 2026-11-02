
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
  UserX,
} from "lucide-react";

import { apiRequest } from "../lib/api";

type Cashier = {
  id: string;
  username: string;
  display_name: string;
  is_active: boolean;
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
};

const EMPTY_FORM: CashierForm = {
  username: "",
  display_name: "",
  pin: "",
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
      await apiRequest<Cashier>(
        "/api/admin/cashiers",
        {
          method: "POST",
          body: JSON.stringify({
            username,
            display_name: displayName,
            pin: form.pin,
          }),
        },
      );

      setForm(EMPTY_FORM);
      setNotice(`Cashier account "${username}" was created.`);

      await loadCashiers();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setCreating(false);
    }
  };

  const handleToggleAccount = async (cashier: Cashier) => {
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
      await apiRequest(
        `/api/admin/cashiers/${cashier.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            is_active: nextActive,
          }),
        },
      );

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

  const handleResetPin = async (cashier: Cashier) => {
    if (resettingId || activeResetId !== cashier.id) {
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

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ctp-text">
            Cashier Management
          </h2>

          <p className="mt-1 text-sm text-ctp-subtext0">
            Create and manage employee accounts used to sign in to Kinesis POS.
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

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-ctp-surface1 bg-ctp-mantle p-4">
          <div className="flex items-center gap-2 text-ctp-subtext0">
            <UserRound size={17} />
            <span className="text-sm">Total cashiers</span>
          </div>

          <p className="mt-3 text-2xl font-semibold tabular-nums text-ctp-text">
            {cashiers.length}
          </p>
        </div>

        <div className="rounded-xl border border-ctp-surface1 bg-ctp-mantle p-4">
          <div className="flex items-center gap-2 text-ctp-green">
            <ShieldCheck size={17} />
            <span className="text-sm">Active accounts</span>
          </div>

          <p className="mt-3 text-2xl font-semibold tabular-nums text-ctp-text">
            {activeCount}
          </p>
        </div>

        <div className="rounded-xl border border-ctp-surface1 bg-ctp-mantle p-4">
          <div className="flex items-center gap-2 text-ctp-subtext0">
            <UserX size={17} />
            <span className="text-sm">Disabled accounts</span>
          </div>

          <p className="mt-3 text-2xl font-semibold tabular-nums text-ctp-text">
            {cashiers.length - activeCount}
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-ctp-red/30 bg-ctp-red/10 p-3 text-sm text-ctp-red"
        >
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-ctp-green/30 bg-ctp-green/10 p-3 text-sm text-ctp-green"
        >
          <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <div className="rounded-xl border border-ctp-surface1 bg-ctp-mantle p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ctp-blue/10 text-ctp-blue">
            <Plus size={20} />
          </div>

          <div>
            <h3 className="font-semibold text-ctp-text">
              Create cashier account
            </h3>

            <p className="mt-0.5 text-xs text-ctp-subtext0">
              Cashiers use their username and six-digit PIN on POS terminals.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleCreateCashier}
          className="grid gap-4 md:grid-cols-3"
        >
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-ctp-subtext1">
              Username
            </span>

            <input
              type="text"
              autoComplete="off"
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
              className="w-full rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-2.5 text-sm text-ctp-text outline-none transition placeholder:text-ctp-overlay1 focus:border-ctp-blue focus:ring-2 focus:ring-ctp-blue/20"
            />
          </label>

          <label className="space-y-1.5">
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
              className="w-full rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-2.5 text-sm text-ctp-text outline-none transition placeholder:text-ctp-overlay1 focus:border-ctp-blue focus:ring-2 focus:ring-ctp-blue/20"
            />
          </label>

          <label className="space-y-1.5">
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
              className="w-full rounded-lg border border-ctp-surface1 bg-ctp-base px-3 py-2.5 text-sm tracking-[0.35em] text-ctp-text outline-none transition placeholder:text-ctp-overlay1 focus:border-ctp-blue focus:ring-2 focus:ring-ctp-blue/20"
            />
          </label>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-ctp-blue px-4 py-2.5 text-sm font-semibold text-ctp-base transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <Plus size={16} />
              )}

              {creating ? "Creating account..." : "Create cashier"}
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-ctp-surface1 bg-ctp-mantle">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ctp-surface0 px-5 py-4">
          <div>
            <h3 className="font-semibold text-ctp-text">
              Cashier accounts
            </h3>

            <p className="mt-1 text-xs text-ctp-subtext0">
              Manage access and reset employee PINs.
            </p>
          </div>

          <span className="rounded-md bg-ctp-surface0 px-2.5 py-1 text-xs tabular-nums text-ctp-subtext1">
            {cashiers.length} accounts
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-ctp-subtext0">
            <LoaderCircle size={18} className="animate-spin" />
            Loading cashier accounts...
          </div>
        ) : cashiers.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <UserRound
              size={30}
              className="mx-auto text-ctp-overlay1"
            />

            <p className="mt-3 font-medium text-ctp-text">
              No cashier accounts yet
            </p>

            <p className="mt-1 text-sm text-ctp-subtext0">
              Create the first cashier account using the form above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-ctp-surface0">
            {cashiers.map((cashier) => (
              <article
                key={cashier.id}
                className="space-y-4 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ctp-surface0 text-ctp-text">
                      <UserRound size={20} />
                    </div>

                    <div className="min-w-0">
                      <h4 className="font-semibold text-ctp-text">
                        {cashier.display_name}
                      </h4>

                      <p className="mt-0.5 text-xs text-ctp-subtext0">
                        @{cashier.username}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${cashier.is_active
                          ? "border-ctp-green/30 bg-ctp-green/10 text-ctp-green"
                          : "border-ctp-surface1 bg-ctp-surface0 text-ctp-subtext0"
                        }`}
                    >
                      {cashier.is_active ? "Active" : "Disabled"}
                    </span>

                    <button
                      type="button"
                      onClick={() => void handleToggleAccount(cashier)}
                      disabled={busyId === cashier.id}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${cashier.is_active
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

                <div className="grid gap-2 text-xs text-ctp-subtext0 sm:grid-cols-2">
                  <p>Created: {formatDate(cashier.created_at)}</p>
                  <p>Last login: {formatDate(cashier.last_login_at)}</p>
                </div>

                <div className="rounded-lg border border-ctp-surface0 bg-ctp-base p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <KeyRound size={15} className="text-ctp-subtext0" />
                    <span className="text-xs font-semibold text-ctp-text">
                      Reset PIN
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
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
                      disabled={resettingId === cashier.id}
                      className="min-w-0 flex-1 rounded-lg border border-ctp-surface1 bg-ctp-mantle px-3 py-2 text-sm tracking-[0.3em] text-ctp-text outline-none placeholder:tracking-normal placeholder:text-ctp-overlay1 focus:border-ctp-blue focus:ring-2 focus:ring-ctp-blue/20"
                    />

                    <button
                      type="button"
                      onClick={() => void handleResetPin(cashier)}
                      disabled={
                        resettingId === cashier.id ||
                        activeResetId !== cashier.id ||
                        !/^\d{6}$/.test(resetPin)
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-ctp-surface1 px-3 py-2 text-xs font-semibold text-ctp-text transition hover:bg-ctp-surface0 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {resettingId === cashier.id ? (
                        <LoaderCircle size={14} className="animate-spin" />
                      ) : (
                        <KeyRound size={14} />
                      )}

                      Reset PIN
                    </button>
                  </div>

                  <p className="mt-2 text-[11px] leading-5 text-ctp-subtext0">
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
