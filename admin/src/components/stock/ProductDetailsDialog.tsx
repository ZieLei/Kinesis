import { RefreshCw } from "lucide-react";

import Dialog from "../ui/Dialog";
import StatusDot from "../ui/StatusDot";
import { buttonDanger, buttonPrimary, buttonSecondary } from "../ui/styles";
import type { InventoryItem } from "../../types/admin";
import ProductThumbnail from "./ProductThumbnail";
import StockHistoryTable from "./StockHistoryTable";
import {
  STATUS_LABEL,
  STATUS_TONE,
  formatCurrency,
  formatDateTime,
  formatNumber,
} from "./format";


export default function ProductDetailsDialog({
  product,
  imageVersion,
  restoring,
  onClose,
  onEdit,
  onAddStock,
  onAdjust,
  onArchive,
  onRestore,
}: {
  product: InventoryItem;
  imageVersion: number;
  restoring: boolean;
  onClose: () => void;
  onEdit: () => void;
  onAddStock: () => void;
  onAdjust: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const archived = product.archived_at !== null;
  const stockValue =
    product.average_cost !== null && product.stock > 0
      ? product.average_cost * product.stock
      : null;

  const details: Array<[string, React.ReactNode]> = [
    ["SKU", product.sku ?? "No SKU"],
    ["Category", product.category],
    ["Selling price", formatCurrency(product.price)],
    [
      "Stock",
      <span key="stock" className="inline-flex items-center gap-2">
        <span className="font-semibold tabular-nums text-ctp-text">{formatNumber(product.stock)}</span>
        {!archived && (
          <StatusDot tone={STATUS_TONE[product.stock_status]}>
            {STATUS_LABEL[product.stock_status]}
          </StatusDot>
        )}
      </span>,
    ],
    ["Average cost", product.average_cost === null ? "Not recorded" : formatCurrency(product.average_cost)],
    ["Stock value at cost", stockValue === null ? "—" : formatCurrency(stockValue)],
    ...(archived ? [["Archived", formatDateTime(product.archived_at!)] as [string, React.ReactNode]] : []),
  ];

  return (
    <Dialog
      onClose={onClose}
      dismissible={!restoring}
      size="lg"
      labelledBy="product-details-title"
      title={product.name}
      description={
        archived
          ? "Archived: hidden from the POS and active inventory. Its sales and stock history are kept."
          : "Catalog details and recent stock history."
      }
      footer={
        archived ? (
          <>
            <button type="button" onClick={onClose} disabled={restoring} className={buttonSecondary}>
              Close
            </button>
            <button type="button" onClick={onRestore} disabled={restoring} className={buttonPrimary}>
              {restoring && <RefreshCw size={14} aria-hidden="true" className="animate-spin" />}
              Restore product
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onArchive} className={`${buttonDanger} sm:mr-auto`}>
              Archive
            </button>
            <button type="button" onClick={onAdjust} className={buttonSecondary}>
              Adjust
            </button>
            <button type="button" onClick={onAddStock} className={buttonSecondary}>
              Add stock
            </button>
            <button type="button" onClick={onEdit} className={buttonPrimary}>
              Edit
            </button>
          </>
        )
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <ProductThumbnail imageUrl={product.image_url} version={imageVersion} size={96} />
          <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            {details.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-ctp-subtext0">{label}</dt>
                <dd className="text-right text-ctp-subtext1 sm:text-left">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ctp-text">Stock history</h3>
          <StockHistoryTable productId={product.id} />
        </div>
      </div>
    </Dialog>
  );
}
