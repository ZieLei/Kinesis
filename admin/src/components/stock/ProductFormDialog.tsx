import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";

import Dialog from "../ui/Dialog";
import Notice from "../ui/Notice";
import SelectField from "../settings/SelectField";
import {
  buttonDanger,
  buttonPrimary,
  buttonQuiet,
  buttonSecondary,
  buttonSmall,
  inputClass,
} from "../ui/styles";
import {
  createProduct,
  deleteProductImage,
  updateProduct,
  uploadProductImage,
} from "../../lib/adminApi";
import type { AdminProductUpdateRequest, InventoryItem } from "../../types/admin";
import Field from "./Field";
import ProductThumbnail from "./ProductThumbnail";
import {
  categoryKey,
  formatCurrency,
  formatNumber,
  getErrorMessage,
  parseCost,
  parsePrice,
} from "./format";


// Same limits the backend enforces (main.MAX_IMAGE_SIZE, IMAGE_FORMATS).
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const QUICK_ADJUSTMENTS = [-10, -5, 5, 10];

/**
 * Same content check as backend detect_image(): the browser's file type
 * comes from the extension, so a renamed file would otherwise only be
 * rejected after the product was saved.
 */
async function hasImageSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const startsWith = (signature: number[]) => signature.every((byte, i) => bytes[i] === byte);
  const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

  return (
    startsWith([0xff, 0xd8, 0xff]) ||
    startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
    startsWith(ascii("GIF87a")) ||
    startsWith(ascii("GIF89a")) ||
    (startsWith(ascii("RIFF")) && ascii("WEBP").every((byte, i) => bytes[8 + i] === byte))
  );
}
const NEW_CATEGORY = "__new__";

export type SkuPreviewState = {
  /** e.g. "KNS-######"; null while loading or when unavailable. */
  preview: string | null;
  /** True when the saved SKU settings could not be loaded. */
  failed: boolean;
};

type Props = {
  /** null creates a product; otherwise the product being edited. */
  product: InventoryItem | null;
  categories: string[];
  sku: SkuPreviewState;
  imageVersion: number;
  onClose: () => void;
  onSaved: (message: string, tone: "success" | "warning") => void;
};


function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();

  // A labelled group, not <fieldset>/<legend>: a floated legend collapses
  // the flex and grid rows that follow it.
  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className="space-y-3 border-t border-ctp-surface0 pt-4 first:border-t-0 first:pt-0"
    >
      <h3 id={headingId} className="text-xs font-medium uppercase tracking-wide text-ctp-subtext0">
        {title}
      </h3>
      {children}
    </div>
  );
}


export default function ProductFormDialog({
  product,
  categories,
  sku: skuState,
  imageVersion,
  onClose,
  onSaved,
}: Props) {
  const ids = useId();
  const editing = product !== null;

  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [price, setPrice] = useState(product ? product.price.toFixed(2) : "");
  const [customPercent, setCustomPercent] = useState("");
  const [pricingError, setPricingError] = useState("");
  const [initialStock, setInitialStock] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [note, setNote] = useState("");

  // Category: pick an existing one, or type a new one.
  const categoryOptions = useMemo(() => {
    const all = new Map<string, string>();
    for (const value of [...categories, ...(product ? [product.category] : [])]) {
      if (!all.has(categoryKey(value))) all.set(categoryKey(value), value);
    }
    return [...all.values()].sort((a, b) => a.localeCompare(b));
  }, [categories, product]);

  const [categoryChoice, setCategoryChoice] = useState(
    product?.category ?? (categoryOptions.length === 0 ? NEW_CATEGORY : ""),
  );
  const [newCategory, setNewCategory] = useState("");

  const typedCategory = newCategory.trim().replace(/\s+/g, " ");
  const matchingExisting =
    categoryChoice === NEW_CATEGORY && typedCategory
      ? categoryOptions.find((value) => categoryKey(value) === categoryKey(typedCategory))
      : undefined;
  // A typed name that only differs in case or spacing uses the existing spelling.
  const resolvedCategory =
    categoryChoice === NEW_CATEGORY ? (matchingExisting ?? typedCategory) : categoryChoice;

  // Image: a newly chosen file, or removal of the current one.
  const fileInput = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const previewUrl = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile],
  );
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const hasCurrentImage = Boolean(product?.image_url) && !removeImage;

  const chooseImage = async (file: File | undefined) => {
    if (!file) return;

    if (!IMAGE_TYPES.includes(file.type)) {
      setImageError("Choose a JPEG, PNG, GIF or WebP image.");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("Choose an image of 5 MB or less.");
      return;
    }

    if (!(await hasImageSignature(file))) {
      setImageError("This file is not a valid JPEG, PNG, GIF or WebP image.");
      return;
    }

    setImageError("");
    setImageFile(file);
    setRemoveImage(false);
  };

  const clearImage = () => {
    setImageFile(null);
    setImageError("");
    if (fileInput.current) fileInput.current.value = "";
    if (product?.image_url) setRemoveImage(true);
  };

  // Pricing tools (same rules as the POS app's PricingSection).
  const applyPercent = (percentage: number) => {
    const current = Number(price);

    if (parsePrice(price) === null || !(current > 0)) {
      setPricingError("Enter a valid price greater than 0 first.");
      return;
    }

    const adjusted = Math.round(current * (1 + percentage / 100) * 100) / 100;

    if (!(adjusted > 0)) {
      setPricingError("The adjusted price must be greater than 0.");
      return;
    }

    setPrice(adjusted.toFixed(2));
    setCustomPercent("");
    setPricingError("");
  };

  const applyCustomPercent = () => {
    const percentage = Number(customPercent);

    if (customPercent.trim() === "" || !Number.isFinite(percentage) || percentage <= -100) {
      setPricingError("Enter a percentage greater than -100.");
      return;
    }

    applyPercent(percentage);
  };

  // ---- Validation --------------------------------------------------------

  const parsedPrice = parsePrice(price);
  const trimmedName = name.trim();
  const trimmedSku = sku.trim();
  const skuCleared = editing && Boolean(product.sku) && trimmedSku === "";

  const stockBlank = initialStock.trim() === "";
  const parsedStock = editing
    ? 0
    : stockBlank
      ? 0
      : /^\d+$/.test(initialStock.trim()) && Number(initialStock) <= 100000
        ? Number(initialStock)
        : null;
  const needsCost = !editing && parsedStock !== null && parsedStock > 0;
  const parsedCost = needsCost ? parseCost(unitCost) : null;

  // Edit: only fields that actually change are sent.
  const changes: AdminProductUpdateRequest = {};
  if (editing) {
    if (trimmedName && trimmedName !== product.name) changes.name = trimmedName;
    if (resolvedCategory && resolvedCategory !== product.category) changes.category = resolvedCategory;
    if (parsedPrice !== null && Number(parsedPrice) !== product.price) changes.price = parsedPrice;
    if (trimmedSku && trimmedSku !== (product.sku ?? "")) changes.sku = trimmedSku;
  }
  const imageChange = imageFile ? (product?.image_url ? "replace" : "add") : removeImage ? "remove" : null;
  const hasChanges = Object.keys(changes).length > 0 || imageChange !== null;

  const valid =
    trimmedName !== "" &&
    resolvedCategory !== "" &&
    parsedPrice !== null &&
    !skuCleared &&
    parsedStock !== null &&
    (!needsCost || parsedCost !== null) &&
    (!editing || hasChanges);

  // ---- Saving ------------------------------------------------------------

  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const applyImage = async (productId: number) => {
    if (imageFile) await uploadProductImage(productId, imageFile);
    else if (removeImage) await deleteProductImage(productId);
  };

  const submit = async () => {
    if (!valid || busy || parsedPrice === null || parsedStock === null) return;

    // Disabled while in flight, so a double click cannot save twice.
    setBusy(true);
    setError("");

    let saved: { id: number; name: string; sku: string | null };

    try {
      if (editing) {
        saved = Object.keys(changes).length
          ? await updateProduct(product.id, changes)
          : product;
      } else {
        saved = await createProduct({
          name: trimmedName,
          category: resolvedCategory,
          price: parsedPrice,
          sku: trimmedSku || undefined,
          initial_stock: parsedStock || undefined,
          initial_unit_cost: needsCost ? (parsedCost ?? undefined) : undefined,
          note: needsCost ? note.trim() || undefined : undefined,
        });
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
      setReviewing(false);
      setBusy(false);
      return;
    }

    // The catalog change is saved; the image is a separate request, as in
    // the POS app. Report a failure without hiding the saved product.
    try {
      await applyImage(saved.id);
    } catch (caught) {
      onSaved(
        `${saved.name} was ${editing ? "updated" : "created"}, but the image could not be ${imageChange === "remove" ? "removed" : "saved"}: ${getErrorMessage(caught)} Use Edit to try again.`,
        "warning",
      );
      return;
    }

    onSaved(
      editing
        ? `${saved.name} was updated.`
        : parsedStock > 0
          ? `${saved.name} (${saved.sku}) was added with ${formatNumber(parsedStock)} units of opening stock.`
          : `${saved.name} (${saved.sku}) was added. Use Add stock to receive inventory.`,
      "success",
    );
  };

  const titleId = `${ids}-product-title`;

  // ---- Review step -------------------------------------------------------

  if (reviewing && valid && parsedPrice !== null && parsedStock !== null) {
    const skuChange = editing && changes.sku !== undefined;
    const rows: Array<[string, ReactNode]> = editing
      ? [
          ...(changes.name ? [["Name", `${product.name} → ${changes.name}`] as [string, ReactNode]] : []),
          ...(changes.category ? [["Category", `${product.category} → ${changes.category}`] as [string, ReactNode]] : []),
          ...(changes.price
            ? [["Selling price", `${formatCurrency(product.price)} → ${formatCurrency(Number(changes.price))}`] as [string, ReactNode]]
            : []),
          ...(changes.sku ? [["SKU", `${product.sku ?? "None"} → ${changes.sku}`] as [string, ReactNode]] : []),
          ...(imageChange
            ? [["Image", imageChange === "remove" ? "Remove current image" : imageChange === "replace" ? "Replace image" : "Add image"] as [string, ReactNode]]
            : []),
        ]
      : [
          ["Category", resolvedCategory],
          ["SKU", trimmedSku || `Generated${skuState.preview ? ` (${skuState.preview})` : ""}`],
          ["Selling price", formatCurrency(Number(parsedPrice))],
          [
            "Opening stock",
            parsedStock > 0
              ? `${formatNumber(parsedStock)} units at ${formatCurrency(Number(parsedCost))} each`
              : "None",
          ],
          ...(imageFile ? [["Image", imageFile.name] as [string, ReactNode]] : []),
        ];

    return (
      <Dialog
        onClose={onClose}
        dismissible={!busy}
        role="alertdialog"
        labelledBy={titleId}
        title={editing ? (skuChange ? "Confirm SKU change" : "Confirm changes") : "Confirm new product"}
        description={editing ? `Save these changes to ${product.name}?` : `Create ${trimmedName}?`}
        footer={
          <>
            <button type="button" onClick={() => setReviewing(false)} disabled={busy} className={buttonSecondary}>
              Back
            </button>
            <button type="button" onClick={submit} disabled={busy} className={buttonPrimary}>
              {busy && <RefreshCw size={14} aria-hidden="true" className="animate-spin" />}
              {busy ? "Saving" : editing ? (skuChange ? "Change SKU and save" : "Save changes") : "Create product"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm text-ctp-subtext1">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-ctp-subtext0">{label}</dt>
                <dd className="text-right">{value}</dd>
              </div>
            ))}
          </dl>
          {skuChange && (
            <Notice tone="warning" role="note" title="Changing a SKU">
              Past sales keep the old SKU on their records. Labels, barcodes or
              price lists that use the old SKU will no longer match this product.
            </Notice>
          )}
          {editing && (
            <p className="text-xs text-ctp-subtext0">
              Stock, average cost and past sales are not changed by editing.
            </p>
          )}
          {!editing && parsedStock > 0 && (
            <p className="text-xs text-ctp-subtext0">
              Opening stock is recorded as a stock receipt in the product's history.
            </p>
          )}
        </div>
      </Dialog>
    );
  }

  // ---- Form ----------------------------------------------------------------

  return (
    <Dialog
      onClose={onClose}
      labelledBy={titleId}
      size="lg"
      title={editing ? `Edit ${product.name}` : "Add product"}
      description={
        editing
          ? "Catalog details only. Use Add stock or Adjust to change quantities."
          : "Create a catalog entry. To receive units for an existing product, use Add stock."
      }
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonSecondary}>
            Cancel
          </button>
          <button type="button" onClick={() => setReviewing(true)} disabled={!valid} className={buttonPrimary}>
            Review
          </button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) setReviewing(true);
        }}
      >
        {error && <Notice tone="danger" role="alert" title={error} />}

        <Section title="Image">
          <div className="flex items-center gap-4">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Selected product image"
                className="size-24 shrink-0 rounded-md border border-ctp-surface0 object-cover"
              />
            ) : (
              <ProductThumbnail
                imageUrl={hasCurrentImage ? product!.image_url : null}
                version={imageVersion}
                size={96}
              />
            )}
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className={`${buttonSecondary} ${buttonSmall}`}
                >
                  <ImagePlus size={13} aria-hidden="true" />
                  {previewUrl || hasCurrentImage ? "Replace image" : "Choose image"}
                </button>
                {(previewUrl || hasCurrentImage) && (
                  <button type="button" onClick={clearImage} className={`${buttonDanger} ${buttonSmall}`}>
                    <Trash2 size={13} aria-hidden="true" />
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-ctp-subtext0">
                {removeImage && !imageFile
                  ? "The current image will be removed when you save."
                  : "JPEG, PNG, GIF or WebP · up to 5 MB."}
              </p>
              {imageError && <p className="text-xs text-ctp-red">{imageError}</p>}
              <input
                ref={fileInput}
                type="file"
                accept={IMAGE_TYPES.join(",")}
                className="hidden"
                aria-label="Product image file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  // Reset so choosing the same file again still fires a change.
                  event.target.value = "";
                  void chooseImage(file);
                }}
              />
            </div>
          </div>
        </Section>

        <Section title="Details">
          <Field id={`${ids}-name`} label="Product name">
            <input
              id={`${ids}-name`}
              autoFocus
              maxLength={150}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClass}
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Field id={`${ids}-category`} label="Category">
                <SelectField
                  id={`${ids}-category`}
                  value={categoryChoice}
                  onChange={(value) => {
                    setCategoryChoice(value);
                    setNewCategory("");
                  }}
                  options={[
                    ...(categoryChoice === "" ? [{ label: "Select a category…", value: "" }] : []),
                    ...categoryOptions.map((value) => ({ label: value, value })),
                    { label: "New category…", value: NEW_CATEGORY },
                  ]}
                />
              </Field>
              {categoryChoice === NEW_CATEGORY && (
                <>
                  <input
                    aria-label="New category name"
                    maxLength={100}
                    value={newCategory}
                    onChange={(event) => setNewCategory(event.target.value)}
                    placeholder="New category name"
                    className={inputClass}
                  />
                  {matchingExisting && (
                    <p className="text-xs text-ctp-subtext0">
                      Matches the existing category “{matchingExisting}”; that spelling will be used.
                    </p>
                  )}
                </>
              )}
            </div>

            <Field
              id={`${ids}-sku`}
              label={editing ? "SKU" : "SKU (optional)"}
              hint={
                editing
                  ? skuCleared
                    ? <span className="text-ctp-red">A SKU can be changed but not removed.</span>
                    : "Changing it asks for confirmation. Past sales keep their recorded SKU."
                  : skuState.failed
                    ? "Leave blank to generate one. The SKU format could not be loaded."
                    : `Leave blank to generate one${skuState.preview ? ` (${skuState.preview})` : ""}.`
              }
            >
              <input
                id={`${ids}-sku`}
                maxLength={64}
                value={sku}
                onChange={(event) => setSku(event.target.value)}
                aria-invalid={skuCleared}
                className={inputClass}
                placeholder={editing ? "" : (skuState.preview ?? "Auto")}
              />
            </Field>
          </div>
        </Section>

        <Section title="Pricing">
          <Field id={`${ids}-price`} label="Selling price (₱)">
            <input
              id={`${ids}-price`}
              inputMode="decimal"
              value={price}
              onChange={(event) => {
                setPrice(event.target.value);
                setPricingError("");
              }}
              aria-invalid={price !== "" && parsedPrice === null}
              className={inputClass}
              placeholder="0.00"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ctp-subtext0">Adjust</span>
            {QUICK_ADJUSTMENTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => applyPercent(value)}
                className={`${buttonSecondary} ${buttonSmall} tabular-nums ${value < 0 ? "text-ctp-red" : "text-ctp-green"}`}
              >
                {value > 0 ? "+" : "−"}
                {Math.abs(value)}%
              </button>
            ))}
            <div className="flex items-center gap-1">
              <input
                aria-label="Custom percentage"
                inputMode="decimal"
                value={customPercent}
                onChange={(event) => setCustomPercent(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyCustomPercent();
                  }
                }}
                placeholder="%"
                className={`${inputClass} !w-20 !py-1 text-xs`}
              />
              <button type="button" onClick={applyCustomPercent} className={`${buttonQuiet} ${buttonSmall}`}>
                Apply
              </button>
            </div>
          </div>
          {pricingError && <p className="text-xs text-ctp-red">{pricingError}</p>}
          {price !== "" && parsedPrice === null && !pricingError && (
            <p className="text-xs text-ctp-red">Enter a price above zero with at most 2 decimal places.</p>
          )}
          {editing && parsedPrice !== null && Number(parsedPrice) !== product.price && (
            <p className="text-xs text-ctp-subtext0">
              {formatCurrency(product.price)} → {formatCurrency(Number(parsedPrice))}
            </p>
          )}
        </Section>

        {editing ? (
          <Section title="Inventory">
            <p className="text-sm text-ctp-subtext1">
              {formatNumber(product.stock)} in stock · average cost{" "}
              {product.average_cost === null ? "not recorded" : formatCurrency(product.average_cost)}
            </p>
            <p className="text-xs text-ctp-subtext0">
              Quantities and costs change only through Add stock and Adjust, so they keep their history.
            </p>
          </Section>
        ) : (
          <Section title="Opening stock">
            <div className="grid grid-cols-2 items-end gap-3">
              <Field id={`${ids}-stock`} label="Quantity (optional)">
                <input
                  id={`${ids}-stock`}
                  inputMode="numeric"
                  value={initialStock}
                  onChange={(event) => setInitialStock(event.target.value)}
                  aria-invalid={parsedStock === null}
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
                  disabled={!needsCost}
                  aria-invalid={needsCost && unitCost !== "" && parsedCost === null}
                  className={inputClass}
                  placeholder={needsCost ? "0.00" : "—"}
                />
              </Field>
            </div>
            {parsedStock === null && (
              <p className="text-xs text-ctp-red">Opening stock must be a whole number from 0 to 100,000.</p>
            )}
            {needsCost && (
              <Field id={`${ids}-note`} label="Note (optional)" hint="Supplier or delivery reference for the opening stock.">
                <textarea
                  id={`${ids}-note`}
                  rows={2}
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className={inputClass}
                />
              </Field>
            )}
          </Section>
        )}

        {editing && !hasChanges && (
          <p className="text-xs text-ctp-subtext0">Make a change to enable Review.</p>
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  );
}
