
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../lib/api";
import {
  deleteAdminGcashQr,
  fetchAdminSettings,
  saveAdminSettings,
  uploadAdminGcashQr,
} from "../lib/adminApi";
import { defaultSettings } from "../lib/settingsDefaults";
import { sections } from "../lib/settingsSections";
import type {
  SettingsApiResponse,
  SettingsState,
} from "../types/settings";

export function useSettingsManagement() {
  const [settings, setSettings] =
    useState<SettingsState>({ ...defaultSettings });

  const [savedSettings, setSavedSettings] =
    useState<SettingsState>({ ...defaultSettings });

  const [version, setVersion] = useState<number | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingGcashQr, setIsUploadingGcashQr] = useState(false);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasServerConflict, setHasServerConflict] = useState(false);

  const [showSaveNotice, setShowSaveNotice] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");

  const [gcashQrError, setGcashQrError] = useState("");
  const [gcashQrNotice, setGcashQrNotice] = useState("");

  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState("pos");


  // --------------------------------------------------
  // Load settings from the backend
  // --------------------------------------------------


  const loadSettings = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await fetchAdminSettings(signal);

      if (signal?.aborted) return;

      setSettings({ ...response.settings });
      setSavedSettings({ ...response.settings });
      setVersion(response.version);
      setHasServerConflict(false);
      setShowSaveNotice(false);
      setNoticeMessage("");
      setGcashQrError("");
      setGcashQrNotice("");
    } catch (error) {
      if (signal?.aborted) return;

      const message =
        error instanceof Error
          ? error.message
          : "Could not load application settings.";

      setLoadError(message);
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void loadSettings(controller.signal);

    return () => controller.abort();
  }, [loadSettings]);


  // --------------------------------------------------
  // Update individual settings
  // --------------------------------------------------


  const update = <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K],
  ) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));

    setShowSaveNotice(false);
  };


  const hasChanges =
    JSON.stringify(settings) !== JSON.stringify(savedSettings);


  // --------------------------------------------------
  // Search and navigation
  // --------------------------------------------------


  const filteredSections = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return sections;

    return sections.filter((section) =>
      `${section.title} ${section.description} ${section.keywords}`
        .toLowerCase()
        .includes(query),
    );
  }, [search]);

  const navigateTo = (id: string) => {
    setActiveSection(id);

    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top,
          );

        if (visible[0]) {
          setActiveSection(visible[0].target.id);
        }
      },
      {
        rootMargin: "-15% 0px -70% 0px",
        threshold: 0,
      },
    );

    sections.forEach((section) => {
      const element = document.getElementById(section.id);

      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [isLoading]);


  // --------------------------------------------------
  // Previews
  // --------------------------------------------------


  const currencyPreview = (() => {
    const precision = Number(settings.decimalPrecision);
    const safePrecision =
      Number.isInteger(precision) && precision >= 0 && precision <= 4
        ? precision
        : 2;

    const amount = (1234.5).toLocaleString("en-PH", {
      minimumFractionDigits: safePrecision,
      maximumFractionDigits: safePrecision,
    });

    return settings.currencyPlacement === "before"
      ? `${settings.currencySymbol}${amount}`
      : `${amount} ${settings.currencySymbol}`;
  })();

  const skuPreview = (() => {
    const sequence = "1".padStart(Number(settings.skuDigits), "0");

    const year = settings.skuIncludeYear
      ? `${new Date().getFullYear()}-`
      : "";

    if (settings.skuFormat === "prefix-sequence") {
      return `${settings.skuPrefix}-${year}${sequence}`;
    }

    if (settings.skuFormat === "sequence-only") {
      return `${year}${sequence}`;
    }

    return `${settings.skuPrefix}-${year}PART-${sequence}`;
  })();


  // --------------------------------------------------
  // Apply a QR-specific settings response
  // --------------------------------------------------


  const applyGcashQrResponse = (
    response: SettingsApiResponse,
  ) => {
    const nextPath = response.settings.gcashQrImagePath;

    // Preserve unrelated unsaved settings edits. Only update the
    // QR reference in the current and saved documents.
    setSettings((current) => ({
      ...current,
      gcashQrImagePath: nextPath,
    }));

    setSavedSettings((current) => ({
      ...current,
      gcashQrImagePath: nextPath,
    }));

    // Upload and delete increment the shared settings version.
    // Update it so subsequent settings saves don't conflict.
    setVersion(response.version);
    setHasServerConflict(false);

    setGcashQrError("");
  };


  // --------------------------------------------------
  // Upload GCash QR image
  // --------------------------------------------------


  const uploadGcashQr = async (file: File) => {
    if (
      isLoading ||
      isSaving ||
      isUploadingGcashQr ||
      version === null
    ) {
      return;
    }

    setIsUploadingGcashQr(true);
    setGcashQrError("");
    setGcashQrNotice("");

    try {
      const response = await uploadAdminGcashQr(
        file,
        version,
      );

      applyGcashQrResponse(response);

      setGcashQrNotice(
        "GCash QR image uploaded and distributed to connected terminals.",
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setHasServerConflict(true);
        setGcashQrError(
          "Settings changed on the server. Reload the latest settings before uploading the QR image.",
        );
      } else {
        setGcashQrError(
          error instanceof Error
            ? error.message
            : "The GCash QR image could not be uploaded.",
        );
      }
    } finally {
      setIsUploadingGcashQr(false);
    }
  };


  // --------------------------------------------------
  // Remove GCash QR image
  // --------------------------------------------------


  const removeGcashQr = async () => {
    if (
      isLoading ||
      isSaving ||
      isUploadingGcashQr ||
      version === null ||
      !settings.gcashQrImagePath
    ) {
      return;
    }

    setIsUploadingGcashQr(true);
    setGcashQrError("");
    setGcashQrNotice("");

    try {
      const response = await deleteAdminGcashQr(version);

      applyGcashQrResponse(response);

      setGcashQrNotice(
        "GCash QR image removed from the server.",
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setHasServerConflict(true);
        setGcashQrError(
          "Settings changed on the server. Reload the latest settings before removing the QR image.",
        );
      } else {
        setGcashQrError(
          error instanceof Error
            ? error.message
            : "The GCash QR image could not be removed.",
        );
      }
    } finally {
      setIsUploadingGcashQr(false);
    }
  };


  // --------------------------------------------------
  // Save settings to the backend
  // --------------------------------------------------


  const saveSettings = async () => {
    if (
      isLoading ||
      isSaving ||
      isUploadingGcashQr ||
      version === null ||
      hasServerConflict ||
      !hasChanges
    ) {
      return;
    }

    setIsSaving(true);
    setShowSaveNotice(false);

    try {
      const response = await saveAdminSettings(
        settings,
        version,
      );

      setSettings({ ...response.settings });
      setSavedSettings({ ...response.settings });
      setVersion(response.version);
      setHasServerConflict(false);

      setNoticeMessage(
        "Settings saved successfully to the Kinesis backend.",
      );
      setShowSaveNotice(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setHasServerConflict(true);

        setNoticeMessage(
          "Another admin session changed these settings. Reload the latest server settings before saving again.",
        );
      } else {
        setNoticeMessage(
          error instanceof Error
            ? error.message
            : "Settings could not be saved.",
        );
      }

      setShowSaveNotice(true);
    } finally {
      setIsSaving(false);
    }
  };


  // --------------------------------------------------
  // Reload the latest server settings
  // --------------------------------------------------


  const reloadSettings = async () => {
    await loadSettings();
  };


  // --------------------------------------------------
  // Local editing actions
  // --------------------------------------------------


  const resetSettings = () => {
    setSettings({ ...defaultSettings });
    setShowSaveNotice(false);
    setNoticeMessage("");
  };

  const restoreSavedSettings = () => {
    setSettings({ ...savedSettings });
    setShowSaveNotice(false);
    setNoticeMessage("");
  };


  return {
    settings,
    update,
    hasChanges,

    search,
    setSearch,
    filteredSections,
    activeSection,
    navigateTo,

    currencyPreview,
    skuPreview,

    version,
    isLoading,
    isSaving,
    loadError,
    hasServerConflict,

    isUploadingGcashQr,
    gcashQrError,
    gcashQrNotice,
    uploadGcashQr,
    removeGcashQr,

    showSaveNotice,
    noticeMessage,
    saveSettings,
    resetSettings,
    restoreSavedSettings,
    reloadSettings,
  };
}
