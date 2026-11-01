

import { useState, type FormEvent } from "react";

import {
  Activity,
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  ShieldCheck,
} from "lucide-react";

import { ApiError } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";

function getLoginError(error: unknown): string {
  if (error instanceof ApiError) {
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
      });

      setPassword("");
    } catch (requestError) {
      setError(getLoginError(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || status === "loading";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ctp-base px-4 py-10 font-line-seed text-ctp-text">
      {/* Background decoration */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -left-32 -top-32 size-96 rounded-full bg-ctp-mauve/5 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 size-[500px] rounded-full bg-ctp-blue/5 blur-3xl" />

        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "radial-gradient(currentColor 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl border border-ctp-surface1 bg-ctp-mantle shadow-lg shadow-black/5">
            <Activity
              size={31}
              strokeWidth={2.2}
              className="text-ctp-mauve"
            />
          </div>

          <h1 className="mt-5 font-fredoka text-4xl tracking-tight text-ctp-text">
            Kinesis
          </h1>

          <p className="mt-2 text-sm font-medium text-ctp-subtext0">
            Server administration
          </p>
        </div>

        {/* Login card */}
        <section className="overflow-hidden rounded-2xl border border-ctp-surface1 bg-ctp-mantle shadow-2xl shadow-black/10">
          <div className="border-b border-ctp-surface0 px-6 py-5 sm:px-8">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-ctp-mauve/10 text-ctp-mauve">
                <ShieldCheck size={19} />
              </div>

              <div>
                <h2 className="text-base font-bold text-ctp-text">
                  Administrator sign in
                </h2>

                <p className="mt-0.5 text-xs text-ctp-subtext0">
                  Access your Kinesis control panel.
                </p>
              </div>
            </div>
          </div>

          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="flex flex-col gap-5 px-6 py-6 sm:px-8 sm:py-8"
          >
            {/* Username */}
            <div>
              <label
                htmlFor="admin-username"
                className="mb-2 block text-xs font-semibold text-ctp-subtext1"
              >
                Username
              </label>

              <div className="relative">
                <KeyRound
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ctp-overlay1"
                />

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
                  className="w-full rounded-lg border border-ctp-surface1 bg-ctp-base py-3 pl-10 pr-3 text-sm text-ctp-text outline-none transition placeholder:text-ctp-overlay0 hover:border-ctp-overlay1 focus:border-ctp-mauve focus:ring-2 focus:ring-ctp-mauve/15 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <label
                  htmlFor="admin-password"
                  className="text-xs font-semibold text-ctp-subtext1"
                >
                  Password
                </label>

                <LockKeyhole
                  size={13}
                  className="text-ctp-overlay1"
                />
              </div>

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
                  className="w-full rounded-lg border border-ctp-surface1 bg-ctp-base py-3 pl-3.5 pr-11 text-sm text-ctp-text outline-none transition placeholder:text-ctp-overlay0 hover:border-ctp-overlay1 focus:border-ctp-mauve focus:ring-2 focus:ring-ctp-mauve/15 disabled:opacity-50"
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
                  className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-ctp-overlay1 transition hover:bg-ctp-surface0 hover:text-ctp-text disabled:opacity-50"
                >
                  {showPassword ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-ctp-red/20 bg-ctp-red/5 p-3"
              >
                <AlertCircle
                  size={16}
                  className="mt-0.5 shrink-0 text-ctp-red"
                />

                <p className="text-xs leading-relaxed text-ctp-red">
                  {error}
                </p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={
                busy ||
                !username.trim() ||
                !password
              }
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-ctp-mauve px-4 py-3 text-sm font-bold text-ctp-base shadow-sm shadow-ctp-mauve/10 transition hover:bg-ctp-mauve/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ctp-mauve focus-visible:ring-offset-2 focus-visible:ring-offset-ctp-mantle disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <>
                  <LoaderCircle
                    size={17}
                    className="animate-spin"
                  />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn size={17} />
                  Sign in
                </>
              )}
            </button>

            <p className="text-center text-[11px] leading-relaxed text-ctp-subtext0">
              Authorized administrators only.
              <br />
              Access is managed by the Kinesis server.
            </p>
          </form>
        </section>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-ctp-overlay1">
          <LockKeyhole size={12} />
          <span>Protected administrator access</span>
        </div>
      </div>
    </main>
  );
}
