import { Wrench } from "lucide-react";
import { useState } from "react";

import { buttonSecondary, buttonSmall } from "../ui/styles";
import type { ServerStatus } from "../../types/server";

function when(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

/** Always visible while maintenance mode is on, so nobody forgets it. */
export default function MaintenanceBanner({
  maintenance,
  onTurnOff,
}: {
  maintenance: ServerStatus["maintenance"];
  onTurnOff: () => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!maintenance.enabled) return null;

  const detail = [
    maintenance.changed_by ? `Turned on by ${maintenance.changed_by}` : "Turned on",
    when(maintenance.changed_at),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      role="status"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-r-md border-l-2 border-ctp-yellow bg-ctp-yellow/10 px-3 py-2.5"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <Wrench size={16} className="mt-0.5 shrink-0 text-ctp-yellow" aria-hidden="true" />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-ctp-yellow">Maintenance mode is on</p>
          <p className="text-xs text-ctp-subtext1">
            Terminals can look things up but cannot sell or change stock. This console works normally. {detail}.
          </p>
          {error && <p className="mt-1 text-xs text-ctp-red">{error}</p>}
        </div>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          const failure = await onTurnOff();
          if (failure) setError(failure);
          setBusy(false);
        }}
        className={`${buttonSecondary} ${buttonSmall}`}
      >
        {busy ? "Turning off…" : "Turn off"}
      </button>
    </div>
  );
}
