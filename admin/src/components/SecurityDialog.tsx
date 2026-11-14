import { useEffect, useState } from "react";

import { LoaderCircle } from "lucide-react";

import Dialog from "./ui/Dialog";
import Notice from "./ui/Notice";
import {
  buttonDangerSolid,
  buttonPrimary,
  buttonSecondary,
  inputClass,
  labelClass,
} from "./ui/styles";
import {
  disableMfa,
  enableMfa,
  fetchMfaStatus,
  startMfaSetup,
  type MfaSetup,
  type MfaStatus,
} from "../lib/authApi";

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

/** Turn two-step sign-in (authenticator app) on or off for this account. */
export default function SecurityDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    fetchMfaStatus(controller.signal)
      .then(setStatus)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(message(caught));
      });

    return () => controller.abort();
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");

    try {
      await action();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      onClose={onClose}
      title="Two-step sign-in"
      description="Ask for a code from an authenticator app each time this account signs in."
      footer={
        <button type="button" onClick={onClose} className={buttonSecondary}>
          {recoveryCodes ? "I saved my codes" : "Close"}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <Notice tone="danger" role="alert">
            {error}
          </Notice>
        )}

        {status === null && !error && (
          <p className="text-sm text-ctp-subtext0">Loading…</p>
        )}

        {recoveryCodes && (
          <div>
            <Notice tone="warning" title="Save these recovery codes now">
              Each works once if you lose your phone. They will not be shown again.
            </Notice>
            <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-ctp-text">
              {recoveryCodes.map((item) => (
                <li key={item} className="rounded border border-ctp-surface1 px-2 py-1">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!recoveryCodes && status && !status.enabled && !setup && (
          <button
            type="button"
            disabled={busy}
            className={buttonPrimary}
            onClick={() => void run(async () => setSetup(await startMfaSetup()))}
          >
            {busy && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
            Set up two-step sign-in
          </button>
        )}

        {!recoveryCodes && setup && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const result = await enableMfa(code);
                setRecoveryCodes(result.recovery_codes);
                setSetup(null);
                setCode("");
                setStatus({ enabled: true, recovery_codes_remaining: result.recovery_codes.length });
              });
            }}
          >
            <p className="text-sm text-ctp-text">
              In your authenticator app choose “Enter a setup key” and type this key
              (time-based, 6 digits):
            </p>
            <p className="select-all break-all rounded border border-ctp-surface1 px-3 py-2 font-mono text-sm tracking-wider text-ctp-text">
              {setup.secret}
            </p>
            <label htmlFor="mfa-code" className={labelClass}>
              Enter the 6-digit code it shows
            </label>
            <input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className={inputClass}
            />
            <button type="submit" disabled={busy} className={buttonPrimary}>
              Turn on
            </button>
          </form>
        )}

        {!recoveryCodes && status?.enabled && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await disableMfa(password, code);
                setStatus({ enabled: false, recovery_codes_remaining: 0 });
                setPassword("");
                setCode("");
              });
            }}
          >
            <p className="text-sm text-ctp-text">
              Two-step sign-in is <strong>on</strong> ({status.recovery_codes_remaining} recovery
              codes left). To turn it off, confirm with your password and a current code.
            </p>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              aria-label="Password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
            />
            <input
              inputMode="numeric"
              placeholder="6-digit code or recovery code"
              aria-label="Verification code"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className={inputClass}
            />
            <button type="submit" disabled={busy} className={buttonDangerSolid}>
              Turn off
            </button>
          </form>
        )}
      </div>
    </Dialog>
  );
}
