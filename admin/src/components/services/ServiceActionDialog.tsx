import { useState } from "react";
import { RefreshCw } from "lucide-react";

import Dialog from "../ui/Dialog";
import Notice from "../ui/Notice";
import { buttonDangerSolid, buttonPrimary, buttonSecondary } from "../ui/styles";
import { archiveAdminService, deleteAdminService, restoreAdminService } from "../../lib/adminApi";
import type { ManagedService } from "../../types/admin";
import { getErrorMessage } from "../stock/format";

export type ServiceAction = "archive" | "restore" | "delete";

const COPY: Record<ServiceAction, { title: (n: string) => string; confirm: string; body: (s: ManagedService) => string; done: (n: string) => string }> = {
  archive: {
    title: (name) => `Archive ${name}?`,
    confirm: "Archive service",
    body: (s) =>
      `It will no longer appear on POS terminals or be sellable. ${
        s.times_sold > 0 ? `Its ${s.times_sold} past sale${s.times_sold === 1 ? "" : "s"} and revenue stay in reports. ` : ""
      }You can restore it later from the Archived view.`,
    done: (name) => `${name} was archived.`,
  },
  restore: {
    title: (name) => `Restore ${name}?`,
    confirm: "Restore service",
    body: () => "It will appear on POS terminals again at its current price.",
    done: (name) => `${name} was restored.`,
  },
  delete: {
    title: (name) => `Permanently delete ${name}?`,
    confirm: "Delete permanently",
    body: () => "This service has never been sold, so it can be deleted. This cannot be undone.",
    done: (name) => `${name} was deleted.`,
  },
};

export default function ServiceActionDialog({
  service,
  action,
  onClose,
  onDone,
}: {
  service: ManagedService;
  action: ServiceAction;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const copy = COPY[action];

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      if (action === "archive") await archiveAdminService(service.id);
      else if (action === "restore") await restoreAdminService(service.id);
      else await deleteAdminService(service.id);

      onDone(copy.done(service.name));
    } catch (caught) {
      setError(getErrorMessage(caught));
      setBusy(false);
    }
  };

  const destructive = action !== "restore";

  return (
    <Dialog
      onClose={onClose}
      dismissible={!busy}
      role="alertdialog"
      labelledBy="service-action-title"
      title={copy.title(service.name)}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={buttonSecondary}>
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className={destructive && action === "delete" ? buttonDangerSolid : buttonPrimary}
          >
            {busy && <RefreshCw size={14} aria-hidden="true" className="animate-spin" />}
            {copy.confirm}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-ctp-subtext1">
        {error && <Notice tone="danger" role="alert" title={error} />}
        <p>{copy.body(service)}</p>
      </div>
    </Dialog>
  );
}
