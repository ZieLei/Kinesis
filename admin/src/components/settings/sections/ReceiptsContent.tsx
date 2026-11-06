import { useRef, useState } from "react";
import type { ChangeEvent } from "react";

import type {
  SectionDefinition,
  SettingsState,
  UpdateSetting,
} from "../../../types/settings";

import FieldList from "../FieldList";
import Notice from "../Notice";
import { buttonDanger, buttonPrimary } from "../styles";

const MAX_QR_BYTES = 5 * 1024 * 1024;

export default function ReceiptsContent({
  section,
  settings,
  onUpdate,
  currencyPreview,
  version,
  isUploadingGcashQr,
  gcashQrError,
  gcashQrNotice,
  onUploadGcashQr,
  onRemoveGcashQr,
}: {
  section: SectionDefinition;
  settings: SettingsState;
  onUpdate: UpdateSetting;
  currencyPreview: string;
  version: number | null;
  isUploadingGcashQr: boolean;
  gcashQrError: string;
  gcashQrNotice: string;
  onUploadGcashQr: (file: File) => Promise<void>;
  onRemoveGcashQr: () => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileValidationError, setFileValidationError] = useState("");

  const hasGcashQr = Boolean(settings.gcashQrImagePath);

  const qrImageUrl = hasGcashQr
    ? `/api/admin/settings/gcash-qr?version=${version ?? 0}`
    : null;

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) return;

    // Reset immediately so the same file can be selected again.
    input.value = "";

    const extension = file.name.split(".").pop()?.toLowerCase();
    const mimeType = file.type.toLowerCase();

    const hasSupportedExtension = ["png", "jpg", "jpeg"].includes(
      extension ?? "",
    );

    const hasSupportedMimeType = [
      "image/png",
      "image/x-png",
      "image/jpeg",
      "image/pjpeg",
    ].includes(mimeType);

    if (!hasSupportedExtension && !hasSupportedMimeType) {
      setFileValidationError(
        "Unsupported file format. Please select a PNG or JPEG image.",
      );
      return;
    }

    if (file.size === 0) {
      setFileValidationError("The selected file is empty.");
      return;
    }

    if (file.size > MAX_QR_BYTES) {
      setFileValidationError(
        "The image exceeds the maximum allowed size of 5 MiB.",
      );
      return;
    }

    setFileValidationError("");

    try {
      await onUploadGcashQr(file);
    } catch (error) {
      setFileValidationError(
        error instanceof Error
          ? error.message
          : "The QR image could not be uploaded.",
      );
    }
  };

  const handleRemove = () => {
    if (!hasGcashQr || isUploadingGcashQr) return;

    const confirmed = window.confirm(
      "Remove the saved GCash payment QR code?",
    );

    if (confirmed) {
      void onRemoveGcashQr();
    }
  };

  const displayedError = fileValidationError || gcashQrError;
  const uploadDisabled = isUploadingGcashQr || version === null;

  return (
    <>
      <FieldList
        fields={section.fields}
        settings={settings}
        onUpdate={onUpdate}
      />

      <div>
        <h3 className="text-sm font-semibold text-ctp-text">
          GCash payment QR
        </h3>
        <p className="mt-0.5 text-xs leading-relaxed text-ctp-subtext0">
          POS terminals show this image when a cashier selects GCash. It is
          stored on the host computer, not on individual terminals.
        </p>

        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-44 w-full items-center justify-center rounded-md border border-dashed border-ctp-surface1 bg-ctp-mantle p-3 sm:w-44 sm:shrink-0">
            {qrImageUrl ? (
              <img
                key={qrImageUrl}
                src={qrImageUrl}
                alt="Saved GCash payment QR code"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <p className="text-center text-xs text-ctp-subtext0">
                No QR code uploaded
              </p>
            )}
          </div>

          <div className="min-w-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,.jpg,.jpeg,.png"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploadDisabled}
              aria-label="Choose GCash QR image"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setFileValidationError("");
                  fileInputRef.current?.click();
                }}
                disabled={uploadDisabled}
                className={buttonPrimary}
              >
                {isUploadingGcashQr
                  ? "Uploading…"
                  : hasGcashQr
                    ? "Replace image"
                    : "Upload image"}
              </button>

              {hasGcashQr && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={isUploadingGcashQr}
                  className={buttonDanger}
                >
                  Remove
                </button>
              )}
            </div>

            <p className="mt-2 text-xs text-ctp-subtext0">
              JPEG or PNG, up to 5 MiB. Use a clear image of your official
              shop QR code.
            </p>
          </div>
        </div>

        {displayedError && (
          <div className="mt-3">
            <Notice tone="danger" role="alert">
              {displayedError}
            </Notice>
          </div>
        )}

        {gcashQrNotice && (
          <div className="mt-3">
            <Notice tone="success" role="status">
              {gcashQrNotice}
            </Notice>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-ctp-text">
          Receipt preview
        </h3>

        <div className="mt-3 w-full max-w-xs border border-dashed border-ctp-surface1 bg-ctp-mantle p-4 text-center">
          <p className="whitespace-pre-wrap text-xs font-bold text-ctp-text">
            {settings.receiptHeader || "STORE NAME"}
          </p>

          <div className="my-3 border-t border-dashed border-ctp-surface1" />

          <div className="space-y-1.5 text-left text-[11px] text-ctp-subtext0">
            <div className="flex justify-between gap-3">
              <span>Sample item</span>
              <span className="shrink-0 tabular-nums">{currencyPreview}</span>
            </div>

            <div className="flex justify-between gap-3">
              <span>Tax rate</span>
              <span className="tabular-nums">{settings.taxRate || "0"}%</span>
            </div>
          </div>

          <div className="my-3 border-t border-dashed border-ctp-surface1" />

          <p className="whitespace-pre-wrap text-[11px] text-ctp-text">
            {settings.receiptFooter}
          </p>

          {settings.receiptNotes && (
            <p className="mt-2 whitespace-pre-wrap text-[10px] leading-relaxed text-ctp-subtext0">
              {settings.receiptNotes}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
