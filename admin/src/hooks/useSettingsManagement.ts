import { useEffect, useMemo, useState } from "react";
import { defaultSettings } from "../lib/settingsDefaults";
import { sections } from "../lib/settingsSections";
import type { SettingsState } from "../types/settings";

export function useSettingsManagement() {
  const [settings, setSettings] =
    useState<SettingsState>({ ...defaultSettings });
  const [savedSettings, setSavedSettings] =
    useState<SettingsState>({ ...defaultSettings });
  const [showSaveNotice, setShowSaveNotice] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState("pos");

  const update = <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setShowSaveNotice(false);
  };

  const hasChanges =
    JSON.stringify(settings) !== JSON.stringify(savedSettings);

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

        if (visible[0]) setActiveSection(visible[0].target.id);
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
  }, []);

  const currencyPreview = (() => {
    const amount = (1234.5).toLocaleString("en-PH", {
      minimumFractionDigits: Number(settings.decimalPrecision),
      maximumFractionDigits: Number(settings.decimalPrecision),
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

  const saveSettings = () => {
    setSavedSettings({ ...settings });
    setNoticeMessage(
      "Preview saved in this page only. Changes have not been sent to the backend or other terminals.",
    );
    setShowSaveNotice(true);
  };

  const resetSettings = () => {
    setSettings({ ...defaultSettings });
    setShowSaveNotice(false);
    setNoticeMessage(
      "Default values restored in this page. Save to update the preview state.",
    );
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

    showSaveNotice,
    noticeMessage,
    saveSettings,
    resetSettings,
    restoreSavedSettings,
  };
}
