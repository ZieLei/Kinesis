

import { useState, type FormEvent } from "react";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";

import Notice from "../components/ui/Notice";
import { buttonPrimary, inputClass, labelClass } from "../components/ui/styles";

import { ApiError } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";

function getLoginError(error: unknown, usedCode: boolean): string {
  if (error instanceof ApiError) {
    if (error.status === 401 && usedCode) {
      return "That verification code is not valid.";
    }

    if (error.status === 401) {
      return "The username or password you entered is incorrect.";
    }

    if (error.status === 429) {
      return "Too many unsuccessful attempts. Please try again later.";
    }

    if (error.status >= 500) {
      return "The authentication service is temporarily unavailable.";
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to sign in. Please try again.";
}

export default function Login() {
  const { login, status } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [otp, setOtp] = useState("");

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const normalizedUsername = username.trim();

    if (!normalizedUsername || !password) {
      setError("Enter your username and password.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await login({
        username: normalizedUsername,
        password,
        ...(needsCode ? { otp: otp.trim() } : {}),
      });

      setPassword("");
      setOtp("");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 428) {
        // Password accepted; the account has two-factor authentication.
        setNeedsCode(true);
        setError("");
      } else {
        setError(getLoginError(requestError, needsCode));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || status === "loading";

  return (
    <main className="flex min-h-screen items-center justify-center bg-ctp-base px-4 py-10 font-line-seed text-ctp-text">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-6 text-center">
          <h1 className="font-fredoka text-3xl text-ctp-text">
            Kinesis
          </h1>

          <p className="mt-1 text-xs text-ctp-subtext0">
            Server administration
          </p>
        </div>

        {/* Login card */}
        <section
          aria-labelledby="admin-sign-in-heading"
          className="rounded-lg border border-ctp-surface0 bg-ctp-mantle"
        >
          <div className="border-b border-ctp-surface0 px-6 py-4">
            <h2
              id="admin-sign-in-heading"
              className="text-sm font-semibold text-ctp-text"
            >
              Administrator sign in
            </h2>

            <p className="mt-0.5 text-xs text-ctp-subtext0">
              Access your Kinesis control panel.
            </p>
          </div>

          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="flex flex-col gap-4 px-6 py-5"
          >
            {/* Username */}
            <div>
              <label
                htmlFor="admin-username"
                className={`${labelClass} mb-1.5`}
              >
                Username
              </label>

              <input
                id="admin-username"
                type="text"
                name="username"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setError("");
                }}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={64}
                required
                disabled={busy}
                placeholder="Enter your username"
                className={`${inputClass} !py-2`}
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="admin-password"
                className={`${labelClass} mb-1.5`}
              >
                Password
              </label>

              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  autoComplete="current-password"
                  maxLength={128}
                  required
                  disabled={busy}
                  placeholder="Enter your password"
                  className={`${inputClass} !py-2 pr-10`}
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword((current) => !current)
                  }
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                  aria-pressed={showPassword}
                  disabled={busy}
                  className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded text-ctp-overlay1 transition hover:bg-ctp-surface0 hover:text-ctp-text disabled:opacity-50"
                >
                  {showPassword ? (
                    <EyeOff size={15} />
                  ) : (
                    <Eye size={15} />
                  )}
                </button>
              </div>
            </div>

            {/* Second factor (shown after the password is accepted) */}
            {needsCode && (
              <div>
                <label
                  htmlFor="admin-otp"
                  className={`${labelClass} mb-1.5`}
                >
                  Verification code
                </label>

                <input
                  id="admin-otp"
                  type="text"
                  name="otp"
                  value={otp}
                  onChange={(event) => {
                    setOtp(event.target.value);
                    setError("");
                  }}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={32}
                  required
                  autoFocus
                  disabled={busy}
                  placeholder="6-digit code or recovery code"
                  className={`${inputClass} !py-2`}
                />

                <p className="mt-1 text-xs text-ctp-subtext0">
                  Open your authenticator app, or enter one of your recovery codes.
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <Notice tone="danger" role="alert">
                {error}
              </Notice>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={
                busy ||
                !username.trim() ||
                !password
              }
              className={`${buttonPrimary} w-full !py-2`}
            >
              {busy && (
                <LoaderCircle
                  size={15}
                  aria-hidden="true"
                  className="animate-spin"
                />
              )}
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </section>

        {/* Footer */}
        <p className="mt-4 text-center text-xs leading-relaxed text-ctp-subtext0">
          Authorized administrators only. Access is managed by the Kinesis
          server.
        </p>
      </div>
    </main>
  );
}
