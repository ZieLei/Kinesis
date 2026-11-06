
import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

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

type BusyAction = "account" | "role";

const EMPTY_FORM: CashierForm = {
  username: "",
  display_name: "",
  pin: "",
  is_supervisor: false,
};

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ctp-blue";

const INPUT =
  "w-full min-w-0 rounded-md border border-ctp-surface1 bg-ctp-mantle px-3 py-1.5 text-sm text-ctp-text outline-none transition placeholder:text-ctp-overlay0 focus:border-ctp-blue focus:ring-1 focus:ring-ctp-blue disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_BASE = `inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`;

const PRIMARY = `${BUTTON_BASE} bg-ctp-blue text-ctp-base hover:brightness-110`;
const SECONDARY = `${BUTTON_BASE} border border-ctp-surface1 text-ctp-text hover:bg-ctp-surface0`;
const DANGER = `${BUTTON_BASE} border border-ctp-red/40 text-ctp-red hover:bg-ctp-red/10`;
const SUCCESS = `${BUTTON_BASE} border border-ctp-green/40 text-ctp-green hover:bg-ctp-green/10`;
const LINK = `rounded text-sm text-ctp-blue hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline ${FOCUS_RING}`;

const LABEL = "mb-1 block text-xs font-medium text-ctp-subtext1";

const TH =
  "px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ctp-subtext0";

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
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
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
    setBusyAction("account");
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
      setBusyAction(null);
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
    setBusyAction("role");
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
      setBusyAction(null);
    }
  };

  const handleResetPin = async (cashier: Cashier) => {
    if (resettingId || busyId || activeResetId !== cashier.id) {
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
      await apiRequest(`/api/admin/cashiers/${cashier.id}/reset-pin`, {
        method: "POST",
        body: JSON.stringify({
          pin: resetPin,
        }),
      });

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

  const openReset = (cashierId: string) => {
    setResetPin("");
    setActiveResetId((current) =>
      current === cashierId ? null : cashierId,
    );
  };

  const closeReset = () => {
    setResetPin("");
    setActiveResetId(null);
  };

  const activeCount = cashiers.filter((cashier) => cashier.is_active).length;

  const supervisorCount = cashiers.filter(
    (cashier) => cashier.is_active && cashier.is_supervisor,
  ).length;

  const isMutating = busyId !== null || resettingId !== null;
  const showInitialLoading = loading && !hasLoaded;

  return (
    <section
      className="w-full min-w-0 space-y-6 font-line-seed"
      aria-busy={showInitialLoading}
    >
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-ctp-surface0 pb-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-ctp-text">
            Cashiers
          </h1>
          <p className="mt-0.5 text-xs text-ctp-subtext0">
            {hasLoaded ? (
              <span className="tabular-nums">
                {cashiers.length} {cashiers.length === 1 ? "account" : "accounts"}
                {" · "}
                {activeCount} active
                {" · "}
                {supervisorCount}{" "}
                {supervisorCount === 1 ? "supervisor" : "supervisors"}
              </span>
            ) : (
              "Employee accounts, supervisor access, and PINs."
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadCashiers()}
          disabled={loading}
          className={SECONDARY}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {(error || notice) && (
        <div className="space-y-2">
          {error && (
            <div
              role="alert"
              className="rounded-r-md border-l-2 border-ctp-red bg-ctp-red/5 px-3 py-2.5 text-sm text-ctp-red"
            >
              {error}
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="rounded-r-md border-l-2 border-ctp-green bg-ctp-green/5 px-3 py-2.5 text-sm text-ctp-green"
            >
              {notice}
            </div>
          )}
        </div>
      )}

      <section aria-labelledby="new-account-heading">
        <h2
          id="new-account-heading"
          className="text-sm font-semibold text-ctp-text"
        >
          New account
        </h2>
        <p className="mt-0.5 text-xs text-ctp-subtext0">
          Cashiers sign in on POS terminals with their username and a
          six-digit PIN.
        </p>

        <form
          onSubmit={handleCreateCashier}
          className="mt-3 border-t border-ctp-surface0 pt-4"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_12rem]">
            <label className="min-w-0">
              <span className={LABEL}>Username</span>
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
                className={INPUT}
              />
            </label>

            <label className="min-w-0">
              <span className={LABEL}>Display name</span>
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
                className={INPUT}
              />
            </label>

            <label className="min-w-0">
              <span className={LABEL}>PIN (6 digits)</span>
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
                className={`${INPUT} tracking-[0.3em] placeholder:tracking-normal`}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={form.is_supervisor}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    is_supervisor: event.target.checked,
                  }))
                }
                className="mt-0.5 size-4 accent-[var(--ctp-blue)]"
              />
              <span className="text-sm text-ctp-text">
                Supervisor
                <span className="block text-xs text-ctp-subtext0">
                  Can authorize discounts that require approval.
                </span>
              </span>
            </label>

            <button type="submit" disabled={creating} className={PRIMARY}>
              {creating ? "Creating…" : "Create account"}
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="accounts-heading">
        <h2
          id="accounts-heading"
          className="text-sm font-semibold text-ctp-text"
        >
          Accounts
        </h2>

        {showInitialLoading ? (
          <p
            role="status"
            className="mt-3 border-y border-ctp-surface0 py-8 text-sm text-ctp-subtext0"
          >
            Loading accounts…
          </p>
        ) : !hasLoaded ? (
          <div className="mt-3 border-y border-ctp-surface0 py-8">
            <p className="text-sm font-medium text-ctp-text">
              Could not load accounts
            </p>
            <p className="mt-1 text-xs text-ctp-subtext0">
              Check the connection and try again.
            </p>
            <button
              type="button"
              onClick={() => void loadCashiers()}
              disabled={loading}
              className={`${SECONDARY} mt-3`}
            >
              Try again
            </button>
          </div>
        ) : cashiers.length === 0 ? (
          <div className="mt-3 border-y border-ctp-surface0 py-8">
            <p className="text-sm font-medium text-ctp-text">
              No accounts yet
            </p>
            <p className="mt-1 text-xs text-ctp-subtext0">
              Use the form above to create the first cashier account.
            </p>
          </div>
        ) : (
          <div className="mt-3 w-full overflow-x-auto border-y border-ctp-surface0">
            <table className="w-full min-w-[44rem] border-collapse text-sm">
              <caption className="sr-only">Cashier accounts</caption>

              <thead className="border-b border-ctp-surface0">
                <tr>
                  <th scope="col" className={TH}>
                    Account
                  </th>
                  <th scope="col" className={TH}>
                    Role
                  </th>
                  <th scope="col" className={TH}>
                    Status
                  </th>
                  <th scope="col" className={TH}>
                    Last login
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-ctp-surface0">
                {cashiers.map((cashier) => {
                  const isResetOpen = activeResetId === cashier.id;
                  const isBusy = busyId === cashier.id;
                  const canChangeRole =
                    cashier.is_active || cashier.is_supervisor;

                  return (
                    <Fragment key={cashier.id}>
                      <tr className="align-top">
                        <td className="px-4 py-3">
                          <p
                            className={`max-w-[14rem] truncate font-medium ${cashier.is_active
                                ? "text-ctp-text"
                                : "text-ctp-subtext0"
                              }`}
                          >
                            {cashier.display_name}
                          </p>
                          <p className="mt-0.5 max-w-[14rem] truncate text-xs text-ctp-subtext0">
                            @{cashier.username}
                          </p>
                        </td>

                        <td className="px-4 py-3">
                          <p className="text-ctp-text">
                            {cashier.is_supervisor ? "Supervisor" : "Cashier"}
                          </p>
                          <button
                            type="button"
                            onClick={() => void handleToggleSupervisor(cashier)}
                            disabled={isMutating || loading || !canChangeRole}
                            className={`${LINK} mt-0.5 text-xs`}
                          >
                            {isBusy && busyAction === "role"
                              ? "Saving…"
                              : cashier.is_supervisor
                                ? "Remove supervisor"
                                : "Make supervisor"}
                          </button>
                        </td>

                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className={`size-2 shrink-0 rounded-full ${cashier.is_active
                                  ? "bg-ctp-green"
                                  : "bg-ctp-overlay0"
                                }`}
                            />
                            <span
                              className={
                                cashier.is_active
                                  ? "text-ctp-text"
                                  : "text-ctp-subtext0"
                              }
                            >
                              {cashier.is_active ? "Active" : "Disabled"}
                            </span>
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <p className="text-ctp-text">
                            {formatDate(cashier.last_login_at)}
                          </p>
                          <p className="mt-0.5 text-xs text-ctp-subtext0">
                            Created {formatDate(cashier.created_at)}
                          </p>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openReset(cashier.id)}
                              disabled={isMutating}
                              aria-expanded={isResetOpen}
                              aria-controls={`reset-pin-${cashier.id}`}
                              className={SECONDARY}
                            >
                              Reset PIN
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleToggleAccount(cashier)}
                              disabled={isMutating || loading}
                              className={cashier.is_active ? DANGER : SUCCESS}
                            >
                              {isBusy && busyAction === "account"
                                ? "Saving…"
                                : cashier.is_active
                                  ? "Disable"
                                  : "Enable"}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isResetOpen && (
                        <tr id={`reset-pin-${cashier.id}`}>
                          <td colSpan={5} className="bg-ctp-base px-4 py-3">
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                void handleResetPin(cashier);
                              }}
                              className="flex flex-wrap items-end gap-x-3 gap-y-2"
                            >
                              <label className="w-full sm:w-56">
                                <span className={LABEL}>
                                  New PIN for @{cashier.username}
                                </span>
                                <input
                                  type="password"
                                  inputMode="numeric"
                                  autoComplete="new-password"
                                  maxLength={6}
                                  pattern="[0-9]{6}"
                                  placeholder="6 digits"
                                  value={resetPin}
                                  onChange={(event) =>
                                    setResetPin(
                                      event.target.value
                                        .replace(/\D/g, "")
                                        .slice(0, 6),
                                    )
                                  }
                                  disabled={isMutating}
                                  // eslint-disable-next-line jsx-a11y/no-autofocus
                                  autoFocus
                                  className={`${INPUT} tracking-[0.3em] placeholder:tracking-normal`}
                                />
                              </label>

                              <button
                                type="submit"
                                disabled={
                                  isMutating || !/^\d{6}$/.test(resetPin)
                                }
                                className={PRIMARY}
                              >
                                {resettingId === cashier.id
                                  ? "Resetting…"
                                  : "Set new PIN"}
                              </button>

                              <button
                                type="button"
                                onClick={closeReset}
                                disabled={resettingId !== null}
                                className={SECONDARY}
                              >
                                Cancel
                              </button>
                            </form>

                            <p className="mt-2 text-xs text-ctp-subtext0">
                              Resetting a PIN revokes all existing sessions for
                              this cashier.
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
