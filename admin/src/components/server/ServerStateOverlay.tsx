import { LoaderCircle, Power, RefreshCw } from "lucide-react";

import { buttonPrimary, buttonSecondary } from "../ui/styles";
import type { ServerPhase } from "../../hooks/useServerControl";

function Spinner() {
  return <LoaderCircle size={28} className="animate-spin text-ctp-blue" aria-hidden="true" />;
}

function elapsed(since: number) {
  const seconds = Math.max(0, Math.round((Date.now() - since) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * Full-screen state for the moments the console cannot be used: the server is
 * restarting, is shutting down, or has been shut down. It sits above
 * everything, keeps the page from being used with stale data, and leaves by
 * itself when the server answers again.
 */
export default function ServerStateOverlay({
  phase,
  restartOverdue,
  unclaimed,
  onCheckNow,
}: {
  phase: ServerPhase;
  restartOverdue: boolean;
  unclaimed: boolean;
  onCheckNow: () => void;
}) {
  if (phase.kind === "idle" || phase.kind === "failed") return null;

  let icon = <Spinner />;
  let title = "";
  let body: React.ReactNode = null;

  if (phase.kind === "restarting") {
    title = "Restarting the server";
    body = unclaimed ? (
      <>
        The request is waiting for the server&rsquo;s control service, which has not picked it up. If this stays,
        check it on the server with <code className="rounded bg-ctp-surface0 px-1">systemctl status kinesis-control.path</code>.
      </>
    ) : restartOverdue ? (
      <>
        This is taking longer than usual. The console keeps checking and will continue by itself. If it does not
        come back, run <code className="rounded bg-ctp-surface0 px-1">kinesisctl status</code> on the server.
      </>
    ) : (
      <>Terminals keep their pending sales and reconnect on their own. This page continues when the server is back.</>
    );
  } else if (phase.kind === "stopping") {
    title = "Shutting down the server";
    body = unclaimed ? (
      <>
        The request is waiting for the server&rsquo;s control service, which has not picked it up. Run{" "}
        <code className="rounded bg-ctp-surface0 px-1">kinesisctl stop</code> on the server instead.
      </>
    ) : (
      <>Stopping the services. Terminals will show that the server is unreachable.</>
    );
  } else {
    icon = <Power size={30} className="text-ctp-red" aria-hidden="true" />;
    title = "The server is stopped";
    body = (
      <>
        <p>
          Nothing can be sold and no terminal can connect until it is started again. On the server, run:
        </p>
        <p className="mt-3 rounded-md bg-ctp-surface0 px-3 py-2 font-mono text-sm text-ctp-text">kinesisctl start</p>
        <p className="mt-3">This page checks every few seconds and continues once the server answers.</p>
      </>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="server-state-title"
      aria-live="assertive"
      className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-ctp-crust/85 p-4 backdrop-blur-sm font-line-seed"
    >
      <div className="w-full max-w-md rounded-lg border border-ctp-surface1 bg-ctp-mantle p-6 text-center shadow-lg">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-ctp-surface0">{icon}</div>

        <h2 id="server-state-title" className="mt-4 text-base font-semibold text-ctp-text">
          {title}
        </h2>

        <div className="mt-2 text-left text-sm leading-relaxed text-ctp-subtext0">{body}</div>

        {phase.kind !== "stopped" && (
          <p className="mt-4 text-xs tabular-nums text-ctp-overlay1">Elapsed {elapsed(phase.since)}</p>
        )}

        <div className="mt-5 flex justify-center">
          <button type="button" onClick={onCheckNow} className={phase.kind === "stopped" ? buttonPrimary : buttonSecondary}>
            <RefreshCw size={14} aria-hidden="true" />
            Check now
          </button>
        </div>
      </div>
    </div>
  );
}
