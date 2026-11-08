import { useEffect, useId, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Info,
  PackagePlus,
  Plus,
  RefreshCw,
} from "lucide-react";

import Dialog from "../components/ui/Dialog";
import EmptyState from "../components/ui/EmptyState";
import Notice from "../components/ui/Notice";
import PageHeader from "../components/ui/PageHeader";
import SearchInput from "../components/ui/SearchInput";
import Section from "../components/ui/Section";
import StatusDot from "../components/ui/StatusDot";
import SelectField from "../components/settings/SelectField";
import ArchiveProductDialog from "../components/stock/ArchiveProductDialog";
import Field from "../components/stock/Field";
import ProductDetailsDialog from "../components/stock/ProductDetailsDialog";
import ProductFormDialog, { type SkuPreviewState } from "../components/stock/ProductFormDialog";
import ProductThumbnail from "../components/stock/ProductThumbnail";
import {
  REASON_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  formatCurrency,
  formatDateTime,
  formatNumber,
  getErrorMessage,
  parseCost,
  parseQuantity,
  skuPreview,
} from "../components/stock/format";
import {
  buttonDangerSolid,
  buttonPrimary,
  buttonQuiet,
  buttonSecondary,
  buttonSmall,
  focusRing,
  inputClass,
  tableHead,
} from "../components/ui/styles";
import { useInventoryManagement } from "../hooks/useInventoryManagement";
import { ApiError } from "../lib/api";
import {
  addStock,
  adjustStock,
  fetchAdminSettings,
  fetchInventoryProducts,
  restoreProduct,
} from "../lib/adminApi";
import type {
  InventoryItem,
  InventorySortField,
  StockAdjustmentReason,
  StockStatus,
} from "../types/admin";


const PAGE_SIZE = 25;

const WRITE_OFF_REASONS: StockAdjustmentReason[] = ["damaged", "lost", "expired", "other"];


type View = "active" | "archived";

type DialogState =
  | { kind: "product"; product: InventoryItem | null }
  | { kind: "details"; product: InventoryItem }
  | { kind: "archive"; product: InventoryItem }
  | { kind: "add"; product: InventoryItem | null }
  | { kind: "adjust"; product: InventoryItem }
  | null;

type PageNotice = { text: string; tone: "success" | "warning" | "danger" } | null;


/** Loads the saved SKU format once, for the generated-SKU preview. */
function useSkuPreview(): SkuPreviewState {
  const [state, setState] = useState<SkuPreviewState>({ preview: null, failed: false });

  useEffect(() => {
    const controller = new AbortController();

    fetchAdminSettings(controller.signal)
      .then((response) => setState({ preview: skuPreview(response.settings), failed: false }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ preview: null, failed: true });
      });

    return () => controller.abort();
  }, []);

  return state;
}


export default function Stock() {
  const [view, setView] = useState<View>("active");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<StockStatus | "">("");
  const [sort, setSort] = useState<InventorySortField>("name");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const [dialog, setDialog] = useState<DialogState>(null);
  const [notice, setNotice] = useState<PageNotice>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  // Bumped after saves so replaced images are re-fetched (same URL).
  const [imageVersion, setImageVersion] = useState(0);
  const sku = useSkuPreview();

  const archivedView = view === "archived";

  const { data, loading, refreshing, error, refresh } = useInventoryManagement({
    search,
    category: category || undefined,
    status: archivedView ? undefined : status || undefined,
    sort,
    direction,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    archived: archivedView,
  });

  // Any filter, view or sort change starts again from the first page.
  const updateSearch = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  const updateCategory = (value: string) => {
    setCategory(value);
    setPage(0);
  };

  const updateStatus = (value: string) => {
    setStatus(value as StockStatus | "");
    setPage(0);
  };

  const updateView = (value: View) => {
    setView(value);
    setPage(0);
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(search.trim() || category || (!archivedView && status));

  const toggleSort = (field: InventorySortField) => {
    setPage(0);

    if (sort === field) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setDirection("asc");
    }
  };

  const handleSaved = (message: string, tone: "success" | "warning" = "success") => {
    setDialog(null);
    setNotice({ text: message, tone });
    setImageVersion((version) => version + 1);
    refresh();
  };

  const handleConflict = (message: string) => {
    // Stock changed elsewhere (e.g. a sale); show the fresh numbers.
    setDialog(null);
    setNotice({ text: message, tone: "danger" });
    refresh();
  };

  const handleRestore = async (product: InventoryItem) => {
    if (restoringId !== null) return;
    setRestoringId(product.id);

    try {
      await restoreProduct(product.id);
      handleSaved(
        `${product.name} was restored to active inventory with ${formatNumber(product.stock)} units in stock.`,
      );
    } catch (caught) {
      setDialog(null);
      setNotice({ text: `${product.name} could not be restored: ${getErrorMessage(caught)}`, tone: "danger" });
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-8 pb-8 font-line-seed">
      <div className="space-y-3">
        <PageHeader
          title="Stock management"
          description="Manage the product catalog, receive stock, record write-offs and correct stock counts. Every change is recorded in activity history."
          actions={
            <>
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className={buttonSecondary}
              >
                <RefreshCw
                  size={14}
                  aria-hidden="true"
                  className={refreshing ? "animate-spin" : ""}
                />
                {refreshing ? "Refreshing" : "Refresh"}
              </button>
              <button
                type="button"
                onClick={() => setDialog({ kind: "product", product: null })}
                className={buttonSecondary}
              >
                <Plus size={14} aria-hidden="true" />
                Add product
              </button>
              <button
                type="button"
                onClick={() => setDialog({ kind: "add", product: null })}
                className={buttonPrimary}
              >
                <PackagePlus size={14} aria-hidden="true" />
                Add stock
              </button>
            </>
          }
        />

        {notice && (
          <Notice
            tone={notice.tone}
            role={notice.tone === "danger" ? "alert" : "status"}
            title={notice.text}
            onDismiss={() => setNotice(null)}
          />
        )}
      </div>

      <Section
        title={archivedView ? "Archived products" : "Inventory"}
        description={
          archivedView
            ? "Hidden from the POS and active inventory. Their sales and stock history are kept; restore one to sell it again."
            : data
              ? `Active products. Low stock means ${formatNumber(data.low_stock_threshold)} units or fewer.`
              : "Active products."
        }
        badge={data ? total : undefined}
        actions={
          <div
            role="radiogroup"
            aria-label="Product view"
            className="grid grid-cols-2 gap-1 rounded-md border border-ctp-surface1 p-0.5"
          >
            {(
              [
                ["active", "Active"],
                ["archived", "Archived"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={view === value}
                onClick={() => updateView(value)}
                className={`rounded px-3 py-1 text-xs transition ${focusRing} ${view === value
                  ? "bg-ctp-surface0 font-medium text-ctp-text"
                  : "text-ctp-subtext0 hover:text-ctp-text"
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
        bodyClassName=""
      >
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={updateSearch}
            label="Search products"
            placeholder="Search name or SKU…"
            className="w-full sm:w-72"
          />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <div className="sm:w-48">
              <SelectField
                id="stock-category-filter"
                value={category}
                onChange={updateCategory}
                options={[
                  { label: "All categories", value: "" },
                  ...(data?.categories ?? []).map((name) => ({ label: name, value: name })),
                ]}
              />
            </div>
            {!archivedView && (
              <div className="sm:w-40">
                <SelectField
                  id="stock-status-filter"
                  value={status}
                  onChange={updateStatus}
                  options={[
                    { label: "All statuses", value: "" },
                    { label: STATUS_LABEL.in_stock, value: "in_stock" },
                    { label: STATUS_LABEL.low, value: "low" },
                    { label: STATUS_LABEL.out, value: "out" },
                  ]}
                />
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-3">
            <Notice
              tone="danger"
              role="alert"
              title={`Products could not be loaded: ${error}`}
              action={
                <button type="button" onClick={refresh} className={`${buttonSecondary} ${buttonSmall}`}>
                  Retry
                </button>
              }
            />
          </div>
        )}

        {loading && !data ? (
          <div className="border-y border-ctp-surface0 py-10 text-center text-sm text-ctp-subtext0">
            Loading products…
          </div>
        ) : items.length === 0 ? (
          !error && (
            <div className="border-y border-ctp-surface0">
              <EmptyState
                title={
                  filtered
                    ? "No products match these filters"
                    : archivedView
                      ? "No archived products"
                      : "No active products"
                }
                description={
                  filtered
                    ? "Try a different search or filter."
                    : archivedView
                      ? "Products removed with history are kept here and can be restored."
                      : "Use Add product to create one."
                }
              />
            </div>
          )
        ) : (
          <>
            <div
              className={`relative overflow-x-auto border-y border-ctp-surface0 transition-opacity ${refreshing ? "opacity-60" : ""}`}
              aria-busy={refreshing}
            >
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-ctp-surface0">
                    <SortHeader field="name" sort={sort} direction={direction} onSort={toggleSort} className="pl-0">
                      Product
                    </SortHeader>
                    <SortHeader field="category" sort={sort} direction={direction} onSort={toggleSort} className="hidden md:table-cell">
                      Category
                    </SortHeader>
                    <SortHeader field="price" sort={sort} direction={direction} onSort={toggleSort} align="right">
                      Price
                    </SortHeader>
                    <SortHeader field="stock" sort={sort} direction={direction} onSort={toggleSort} align="right">
                      Stock
                    </SortHeader>
                    <th scope="col" className={tableHead}>{archivedView ? "Archived" : "Status"}</th>
                    <th scope="col" className={`${tableHead} pr-0 text-right`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ctp-surface0">
                  {items.map((product) => (
                    <tr key={product.id} className="transition-colors hover:bg-ctp-surface0/30">
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-3">
                          <ProductThumbnail imageUrl={product.image_url} version={imageVersion} />
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => setDialog({ kind: "details", product })}
                              className={`rounded text-left text-sm font-medium text-ctp-text hover:underline ${focusRing}`}
                            >
                              {product.name}
                            </button>
                            <p className="mt-0.5 text-xs text-ctp-subtext0">
                              {product.sku ?? "No SKU"}
                              <span className="md:hidden"> · {product.category}</span>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-3 py-2.5 text-sm text-ctp-subtext1 md:table-cell">
                        {product.category}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm tabular-nums text-ctp-subtext1">
                        {formatCurrency(product.price)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-ctp-text">
                        {formatNumber(product.stock)}
                      </td>
                      <td className="px-3 py-2.5">
                        {product.archived_at ? (
                          <span className="text-xs tabular-nums text-ctp-subtext0">
                            {formatDateTime(product.archived_at)}
                          </span>
                        ) : (
                          <StatusDot tone={STATUS_TONE[product.stock_status]}>
                            {STATUS_LABEL[product.stock_status]}
                          </StatusDot>
                        )}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <div className="inline-flex gap-1">
                          {archivedView ? (
                            <button
                              type="button"
                              onClick={() => void handleRestore(product)}
                              disabled={restoringId !== null}
                              className={`${buttonSecondary} ${buttonSmall}`}
                              aria-label={`Restore ${product.name}`}
                            >
                              {restoringId === product.id && (
                                <RefreshCw size={12} aria-hidden="true" className="animate-spin" />
                              )}
                              Restore
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setDialog({ kind: "add", product })}
                                className={`${buttonSecondary} ${buttonSmall}`}
                                aria-label={`Add stock to ${product.name}`}
                              >
                                Add
                              </button>
                              <button
                                type="button"
                                onClick={() => setDialog({ kind: "adjust", product })}
                                className={`${buttonSecondary} ${buttonSmall}`}
                                aria-label={`Adjust stock of ${product.name}`}
                              >
                                Adjust
                              </button>
                              <button
                                type="button"
                                onClick={() => setDialog({ kind: "product", product })}
                                className={`${buttonSecondary} ${buttonSmall}`}
                                aria-label={`Edit ${product.name}`}
                              >
                                Edit
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setDialog({ kind: "details", product })}
                            className={`${buttonQuiet} ${buttonSmall}`}
                            aria-label={`Details and history of ${product.name}`}
                            title="Details and stock history"
                          >
                            <Info size={13} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <nav
              aria-label="Product pages"
              className="mt-3 flex items-center justify-between gap-3 text-xs text-ctp-subtext0"
            >
              <span className="tabular-nums">
                Showing {formatNumber(page * PAGE_SIZE + 1)}–
                {formatNumber(page * PAGE_SIZE + items.length)} of {formatNumber(total)}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={page === 0}
                  className={`${buttonQuiet} ${buttonSmall}`}
                >
                  <ChevronLeft size={13} aria-hidden="true" />
                  Previous
                </button>
                <span className="px-1 tabular-nums">
                  {page + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                  disabled={page + 1 >= pageCount}
                  className={`${buttonQuiet} ${buttonSmall}`}
                >
                  Next
                  <ChevronRight size={13} aria-hidden="true" />
                </button>
              </div>
            </nav>
          </>
        )}
      </Section>

      {dialog?.kind === "product" && (
        <ProductFormDialog
          product={dialog.product}
          categories={data?.categories ?? []}
          sku={sku}
          imageVersion={imageVersion}
          onClose={() => setDialog(null)}
          onSaved={handleSaved}
        />
      )}
      {dialog?.kind === "details" && (
        <ProductDetailsDialog
          product={dialog.product}
          imageVersion={imageVersion}
          restoring={restoringId === dialog.product.id}
          onClose={() => setDialog(null)}
          onEdit={() => setDialog({ kind: "product", product: dialog.product })}
          onAddStock={() => setDialog({ kind: "add", product: dialog.product })}
          onAdjust={() => setDialog({ kind: "adjust", product: dialog.product })}
          onArchive={() => setDialog({ kind: "archive", product: dialog.product })}
          onRestore={() => void handleRestore(dialog.product)}
        />
      )}
      {dialog?.kind === "archive" && (
        <ArchiveProductDialog
          product={dialog.product}
          onClose={() => setDialog(null)}
          onDone={(message) => handleSaved(message)}
        />
      )}
      {dialog?.kind === "add" && (
        <AddStockDialog
          initialProduct={dialog.product}
          onClose={() => setDialog(null)}
          onSaved={handleSaved}
          onConflict={handleConflict}
        />
      )}
      {dialog?.kind === "adjust" && (
        <AdjustStockDialog
          product={dialog.product}
          onClose={() => setDialog(null)}
          onSaved={handleSaved}
          onConflict={handleConflict}
        />
      )}
    </div>
  );
}

function SortHeader({
  field,
  sort,
  direction,
  onSort,
  align = "left",
  className = "",
  children,
}: {
  field: InventorySortField;
  sort: InventorySortField;
  direction: "asc" | "desc";
  onSort: (field: InventorySortField) => void;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  const active = sort === field;
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <th
      scope="col"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={`${tableHead} ${align === "right" ? "text-right" : ""} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 rounded hover:text-ctp-text ${active ? "text-ctp-text" : ""} ${focusRing}`}
      >
        {children}
        <Icon size={12} aria-hidden="true" className={active ? "" : "opacity-50"} />
      </button>
    </th>
  );
}


/** "12 → 20" preview line used by both stock dialogs. */
function StockPreview({ before, after }: { before: number; after: number | null }) {
  return (
    <div className="flex items-baseline justify-between border-y border-ctp-surface0 py-2.5 text-sm">
      <span className="text-ctp-subtext0">Resulting stock</span>
      <span className="tabular-nums text-ctp-text">
        {formatNumber(before)}
        <span className="mx-1.5 text-ctp-overlay1" aria-hidden="true">→</span>
        <span className="sr-only"> becomes </span>
        <span className="font-semibold">{after === null ? "—" : formatNumber(after)}</span>
      </span>
    </div>
  );
}




function ProductPicker({ onPick }: { onPick: (product: InventoryItem) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetchInventoryProducts(
        { search: query, sort: "name", direction: "asc", limit: 8, offset: 0 },
        controller.signal,
      )
        .then((response) => {
          setResults(response.items);
          setError("");
        })
        .catch((caught: unknown) => {
          if (!controller.signal.aborted) setError(getErrorMessage(caught));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="space-y-2">
      <SearchInput
        value={query}
        onChange={setQuery}
        label="Find a product"
        placeholder="Search name or SKU…"
      />
      {error ? (
        <Notice tone="danger" role="alert" title={error} />
      ) : (
        <ul
          aria-label="Products"
          aria-busy={loading}
          className={`max-h-64 divide-y divide-ctp-surface0 overflow-y-auto border-y border-ctp-surface0 ${loading ? "opacity-60" : ""}`}
        >
          {results.length === 0 && !loading ? (
            <li className="py-6 text-center text-sm text-ctp-subtext0">No matching products.</li>
          ) : (
            results.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => onPick(product)}
                  className={`flex w-full items-center justify-between gap-3 px-1 py-2 text-left hover:bg-ctp-surface0/40 ${focusRing}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ctp-text">
                      {product.name}
                    </span>
                    <span className="block text-xs text-ctp-subtext0">
                      {product.sku ?? "No SKU"} · {product.category}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-ctp-subtext1">
                    {formatNumber(product.stock)} in stock
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}


type SaveHandlers = {
  onClose: () => void;
  onSaved: (message: string) => void;
  onConflict: (message: string) => void;
};


function AddStockDialog({
  initialProduct,
  onClose,
  onSaved,
  onConflict,
}: SaveHandlers & { initialProduct: InventoryItem | null }) {
  const ids = useId();
  const [product, setProduct] = useState<InventoryItem | null>(initialProduct);
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState(
    initialProduct?.average_cost != null ? String(initialProduct.average_cost) : "",
  );
  const [openingCost, setOpeningCost] = useState("");
  const [note, setNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = (picked: InventoryItem) => {
    setProduct(picked);
    setUnitCost(picked.average_cost != null ? String(picked.average_cost) : "");
  };

  const parsedQuantity = parseQuantity(quantity);
  const parsedCost = parseCost(unitCost);
  // Existing stock without a recorded cost must be valued once.
  const needsOpeningCost = Boolean(product && product.stock > 0 && product.average_cost === null);
  const parsedOpeningCost = needsOpeningCost ? parseCost(openingCost) : null;

  const valid =
    product !== null &&
    parsedQuantity !== null &&
    parsedCost !== null &&
    (!needsOpeningCost || parsedOpeningCost !== null);

  const after = product && parsedQuantity !== null ? product.stock + parsedQuantity : null;

  const submit = async () => {
    if (!product || parsedQuantity === null || parsedCost === null) return;

    setBusy(true);
    setError("");

    try {
      const result = await addStock({
        product_id: product.id,
        quantity: parsedQuantity,
        unit_cost: parsedCost,
        opening_stock_unit_cost: parsedOpeningCost ?? undefined,
        expected_stock: product.stock,
        note: note.trim() || undefined,
      });

      onSaved(
        `Added ${formatNumber(parsedQuantity)} units to ${product.name}. Stock is now ${formatNumber(result.product.stock)}.`,
      );
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        onConflict(caught.message);
      } else {
        setError(getErrorMessage(caught));
        setReviewing(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const titleId = `${ids}-add-title`;

  if (reviewing && product && parsedQuantity !== null && after !== null) {
    return (
      <Dialog
        onClose={onClose}
        dismissible={!busy}
        role="alertdialog"
        labelledBy={titleId}
        title="Confirm stock receipt"
        description={`Add ${formatNumber(parsedQuantity)} units to ${product.name}?`}
        footer={
          <>
            <button type="button" onClick={() => setReviewing(false)} disabled={busy} className={buttonSecondary}>
              Back
            </button>
            <button type="button" onClick={submit} disabled={busy} className={buttonPrimary}>
              {busy && <RefreshCw size={14} aria-hidden="true" className="animate-spin" />}
              Confirm and add stock
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <StockPreview before={product.stock} after={after} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-ctp-subtext1">
            <dt className="text-ctp-subtext0">Unit cost</dt>
            <dd className="text-right tabular-nums">{formatCurrency(Number(parsedCost))}</dd>
            <dt className="text-ctp-subtext0">Receipt total</dt>
            <dd className="text-right tabular-nums">
              {formatCurrency(Number(parsedCost) * parsedQuantity)}
            </dd>
            {note.trim() && (
              <>
                <dt className="text-ctp-subtext0">Note</dt>
                <dd className="text-right">{note.trim()}</dd>
              </>
            )}
          </dl>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      onClose={onClose}
      dismissible={!busy}
      labelledBy={titleId}
      title="Add stock"
      description="Record received inventory. The cost updates the product's average cost."
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonSecondary}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setReviewing(true)}
            disabled={!valid}
            className={buttonPrimary}
          >
            Review
          </button>
        </>
      }
    >
      {!product ? (
        <ProductPicker onPick={pick} />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) setReviewing(true);
          }}
        >
          {error && <Notice tone="danger" role="alert" title={error} />}

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ctp-text">{product.name}</p>
              <p className="text-xs text-ctp-subtext0">
                {product.sku ?? "No SKU"} · {formatNumber(product.stock)} in stock
              </p>
            </div>
            {!initialProduct && (
              <button type="button" onClick={() => setProduct(null)} className={`${buttonQuiet} ${buttonSmall}`}>
                Change
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id={`${ids}-quantity`} label="Quantity to add">
              <input
                id={`${ids}-quantity`}
                inputMode="numeric"
                autoFocus
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                aria-invalid={quantity !== "" && parsedQuantity === null}
                className={inputClass}
                placeholder="0"
              />
            </Field>
            <Field id={`${ids}-cost`} label="Unit cost (₱)">
              <input
                id={`${ids}-cost`}
                inputMode="decimal"
                value={unitCost}
                onChange={(event) => setUnitCost(event.target.value)}
                aria-invalid={unitCost !== "" && parsedCost === null}
                className={inputClass}
                placeholder="0.00"
              />
            </Field>
          </div>

          {needsOpeningCost && (
            <Field
              id={`${ids}-opening`}
              label="Cost of existing stock (₱ per unit)"
              hint={`The ${formatNumber(product.stock)} units already in stock have no recorded cost. Enter it once so the average cost is correct.`}
            >
              <input
                id={`${ids}-opening`}
                inputMode="decimal"
                value={openingCost}
                onChange={(event) => setOpeningCost(event.target.value)}
                className={inputClass}
                placeholder="0.00"
              />
            </Field>
          )}

          <Field id={`${ids}-note`} label="Note (optional)" hint="Supplier, delivery reference or other details.">
            <textarea
              id={`${ids}-note`}
              rows={2}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={inputClass}
            />
          </Field>

          <StockPreview before={product.stock} after={after} />
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      )}
    </Dialog>
  );
}


function AdjustStockDialog({
  product,
  onClose,
  onSaved,
  onConflict,
}: SaveHandlers & { product: InventoryItem }) {
  const ids = useId();
  const [mode, setMode] = useState<"remove" | "count">("remove");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState<StockAdjustmentReason>("damaged");
  const [note, setNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Remove: units to take out. Count: the stock actually on the shelf.
  const parsed =
    mode === "remove"
      ? parseQuantity(quantity)
      : /^\d+$/.test(quantity.trim())
        ? Number(quantity)
        : null;

  const change =
    parsed === null ? null : mode === "remove" ? -parsed : parsed - product.stock;
  const after = change === null ? null : product.stock + change;
  const effectiveReason: StockAdjustmentReason = mode === "count" ? "count_correction" : reason;
  const noteRequired = effectiveReason === "other";

  const problem =
    change === null
      ? null
      : change === 0
        ? "The counted stock matches the current stock; nothing to change."
        : after !== null && after < 0
          ? `Only ${formatNumber(product.stock)} units are in stock.`
          : null;

  const valid = change !== null && problem === null && (!noteRequired || note.trim() !== "");

  const submit = async () => {
    if (change === null) return;

    setBusy(true);
    setError("");

    try {
      const result = await adjustStock({
        product_id: product.id,
        quantity_change: change,
        reason: effectiveReason,
        note: note.trim() || undefined,
        expected_stock: product.stock,
      });

      onSaved(
        `${REASON_LABEL[effectiveReason]} recorded for ${product.name}. Stock is now ${formatNumber(result.product.stock)}.`,
      );
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        onConflict(caught.message);
      } else {
        setError(getErrorMessage(caught));
        setReviewing(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const titleId = `${ids}-adjust-title`;

  if (reviewing && change !== null && after !== null) {
    const removing = change < 0;

    return (
      <Dialog
        onClose={onClose}
        dismissible={!busy}
        role="alertdialog"
        labelledBy={titleId}
        title={removing ? "Confirm write-off" : "Confirm stock correction"}
        description={
          removing
            ? `Remove ${formatNumber(-change)} units of ${product.name}? This is recorded with its reason and cannot be undone, only corrected.`
            : `Increase ${product.name} by ${formatNumber(change)} units to match the stock count?`
        }
        footer={
          <>
            <button type="button" onClick={() => setReviewing(false)} disabled={busy} className={buttonSecondary}>
              Back
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className={removing ? buttonDangerSolid : buttonPrimary}
            >
              {busy && <RefreshCw size={14} aria-hidden="true" className="animate-spin" />}
              {removing ? "Confirm write-off" : "Confirm correction"}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <StockPreview before={product.stock} after={after} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-ctp-subtext1">
            <dt className="text-ctp-subtext0">Reason</dt>
            <dd className="text-right">{REASON_LABEL[effectiveReason]}</dd>
            {note.trim() && (
              <>
                <dt className="text-ctp-subtext0">Note</dt>
                <dd className="text-right">{note.trim()}</dd>
              </>
            )}
          </dl>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      onClose={onClose}
      dismissible={!busy}
      labelledBy={titleId}
      title="Adjust stock"
      description={`${product.name} · ${product.sku ?? "No SKU"} · ${formatNumber(product.stock)} in stock`}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonSecondary}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setReviewing(true)}
            disabled={!valid}
            className={buttonPrimary}
          >
            Review
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) setReviewing(true);
        }}
      >
        {error && <Notice tone="danger" role="alert" title={error} />}

        <div role="radiogroup" aria-label="Adjustment type" className="grid grid-cols-2 gap-1 rounded-md border border-ctp-surface1 p-1">
          {(
            [
              ["remove", "Write off"],
              ["count", "Correct count"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => {
                setMode(value);
                setQuantity("");
              }}
              className={`rounded px-2 py-1 text-sm transition ${focusRing} ${mode === value
                ? "bg-ctp-surface0 font-medium text-ctp-text"
                : "text-ctp-subtext0 hover:text-ctp-text"
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "remove" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field id={`${ids}-quantity`} label="Units to remove">
              <input
                id={`${ids}-quantity`}
                inputMode="numeric"
                autoFocus
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </Field>
            <Field id={`${ids}-reason`} label="Reason">
              <SelectField
                id={`${ids}-reason`}
                value={reason}
                onChange={(value) => setReason(value as StockAdjustmentReason)}
                options={WRITE_OFF_REASONS.map((value) => ({
                  label: REASON_LABEL[value],
                  value,
                }))}
              />
            </Field>
          </div>
        ) : (
          <Field
            id={`${ids}-counted`}
            label="Counted stock"
            hint="Enter the number of units physically on hand."
          >
            <input
              id={`${ids}-counted`}
              inputMode="numeric"
              autoFocus
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className={inputClass}
              placeholder={String(product.stock)}
            />
          </Field>
        )}

        <Field
          id={`${ids}-note`}
          label={noteRequired ? "Note" : "Note (optional)"}
          hint={noteRequired ? "Required when the reason is Other." : undefined}
        >
          <textarea
            id={`${ids}-note`}
            rows={2}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            aria-required={noteRequired}
            className={inputClass}
          />
        </Field>

        {problem && <p className="text-xs text-ctp-red">{problem}</p>}
        <StockPreview before={product.stock} after={after} />
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  );
}
