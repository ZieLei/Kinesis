import { useState } from "react";
import { RefreshCw } from "lucide-react";

import Dialog from "../ui/Dialog";
import Notice from "../ui/Notice";
import { buttonDangerSolid, buttonSecondary } from "../ui/styles";
import { archiveProduct } from "../../lib/adminApi";
import type { InventoryItem } from "../../types/admin";
import { getErrorMessage } from "./format";


/**
 * The backend decides: products with any sales, receipt, adjustment or
 * stockout history are archived; products without history are deleted.
 */
export default function ArchiveProductDialog({
  product,
  onClose,
  onDone,
}: {
  product: InventoryItem;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const result = await archiveProduct(product.id);

      onDone(
        result.deleted
          ? `${product.name} had no sales or stock history, so it was permanently deleted.`
          : `${product.name} was archived. Its history is kept, and it can be restored from the Archived view.`,
      );
    } catch (caught) {
      setError(getErrorMessage(caught));
      setBusy(false);
    }
  };

  return (
    <Dialog
      onClose={onClose}
      dismissible={!busy}
      role="alertdialog"
      labelledBy="archive-product-title"
      title={`Remove ${product.name}?`}
      description="It will no longer be sold or shown in active inventory."
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={buttonSecondary}>
            Cancel
          </button>
          <button type="button" onClick={confirm} disabled={busy} className={buttonDangerSolid}>
            {busy && <RefreshCw size={14} aria-hidden="true" className="animate-spin" />}
            Remove product
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-ctp-subtext1">
        {error && <Notice tone="danger" role="alert" title={error} />}
        <p>
          <span className="font-medium text-ctp-text">If it has any sales or stock history</span>{" "}
          (sales, receipts, adjustments or stockouts), it is <span className="font-medium text-ctp-text">archived</span>:
          its {product.stock > 0 ? `${product.stock} units of ` : ""}stock and all history are kept, and it can be restored.
        </p>
        <p>
          <span className="font-medium text-ctp-text">If it has no history at all</span>, it is permanently deleted
          together with its image.
        </p>
      </div>
    </Dialog>
  );
}
