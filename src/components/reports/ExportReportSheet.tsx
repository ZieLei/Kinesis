import { useState, type ComponentType } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";

import FileText from "lucide-react-native/icons/file-text";
import FileSpreadsheet from "lucide-react-native/icons/file-spreadsheet";
import X from "lucide-react-native/icons/x";

import { styledIcon } from "@/components/StyledIcon";
import { useCashierAuth } from "@/app/context/CashierAuthContext";
import { useTerminalSettings } from "@/app/context/TerminalSettingsContext";
import { useDismissOnBack } from "@/hooks/useDismissOnBack";
import { fetchBusinessAnalytics } from "@/lib/analyticsApi";
import { exportCsv, exportPdf } from "@/lib/documentExport";
import { fetchProductSalesReport, fetchSalesReport } from "@/lib/salesApi";
import {
  PERIOD_TITLES,
  createSalesReportCsv,
  createSalesReportHtml,
  reportFileName,
  type SalesReportInput,
} from "@/lib/salesReportDocument";
import type { ProductSalesReport, ReportQuery } from "@/types/sale";

const StyledFileText = styledIcon(FileText);
const StyledFileSpreadsheet = styledIcon(FileSpreadsheet);
const StyledX = styledIcon(X);

/** Item rows fetched for the export (100 per request, the API maximum). */
const PAGE_SIZE = 100;
const MAX_ITEMS = 1000;

type Format = "pdf" | "csv";

type ExportReportSheetProps = {
  visible: boolean;
  query: ReportQuery;
  /** Shown while the sheet is open, e.g. "1 Nov – 30 Nov 2026". */
  rangeLabel: string | null;
  onClose: () => void;
};

async function loadAllProducts(period: ReportQuery): Promise<ProductSalesReport> {
  const first = await fetchProductSalesReport(PAGE_SIZE, undefined, period);
  const items = [...first.top_products];

  while (items.length < Math.min(first.total_products, MAX_ITEMS)) {
    const page = await fetchProductSalesReport(PAGE_SIZE, undefined, period, { offset: items.length });
    if (page.top_products.length === 0) break;
    items.push(...page.top_products);
  }

  return { ...first, top_products: items.slice(0, MAX_ITEMS) };
}

/**
 * Export the Reports screen as a PDF sales summary or a CSV spreadsheet.
 * Data is fetched fresh for the selected period when a format is chosen,
 * so every figure in the file comes from the same moment.
 */
export default function ExportReportSheet({ visible, query, rangeLabel, onClose }: ExportReportSheetProps) {
  const { settings } = useTerminalSettings();
  const { cashier } = useCashierAuth();
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const close = () => {
    if (busy) return;
    setError("");
    setDone("");
    onClose();
  };

  useDismissOnBack(visible, close);

  const run = async (format: Format) => {
    if (busy) return;
    setBusy(format);
    setError("");
    setDone("");

    try {
      const [sales, products, analytics] = await Promise.all([
        fetchSalesReport(query),
        loadAllProducts(query).catch(() => null),
        fetchBusinessAnalytics(query).catch(() => null),
      ]);

      const input: SalesReportInput = {
        period: query.period,
        sales,
        products,
        analytics,
        settings: settings ?? null,
        preparedBy: cashier ? `${cashier.display_name} (@${cashier.username})` : null,
        generatedAt: new Date(),
      };

      if (format === "pdf") {
        const fileName = reportFileName(input, "pdf");
        await exportPdf(createSalesReportHtml(input), fileName.replace(/\.pdf$/, ""));
        setDone("Choose “Save as PDF” (or a printer) in the dialog.");
      } else {
        const fileName = reportFileName(input, "csv");
        await exportCsv(createSalesReportCsv(input), fileName);
        setDone(`Saved ${fileName}`);
      }

      const missing = [!products && "item sales", !analytics && "payments and profit"].filter(Boolean);
      if (missing.length) {
        setError(`Exported without ${missing.join(" and ")} (could not be loaded).`);
      }
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "The report could not be exported. Check the connection and try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  const option = (
    format: Format,
    Icon: ComponentType<{ size?: number; className?: string }>,
    title: string,
    description: string,
  ) => (
    <Pressable
      onPress={() => void run(format)}
      disabled={busy !== null}
      accessibilityRole="button"
      accessibilityLabel={title}
      className={`mb-3 flex-row items-center rounded-xl border border-ctp-surface1 bg-ctp-mantle p-4 ${busy && busy !== format ? "opacity-50" : ""}`}
    >
      <View className="mr-3 h-10 w-10 items-center justify-center rounded-lg bg-ctp-surface0">
        {busy === format ? <ActivityIndicator size="small" color="#89B4FA" /> : <Icon size={20} className="text-ctp-blue" />}
      </View>
      <View className="flex-1">
        <Text className="font-inter-semibold text-sm text-ctp-text">{title}</Text>
        <Text className="mt-1 font-inter-regular text-xs leading-5 text-ctp-subtext0">{description}</Text>
      </View>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable onPress={close} className="absolute inset-0 bg-black/50" accessibilityLabel="Close export" />

        <View className="rounded-t-3xl bg-ctp-base px-5 pb-8 pt-5">
          <View className="mb-4 flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="font-inter-bold text-lg text-ctp-text">Export report</Text>
              <Text className="mt-1 font-inter-regular text-xs text-ctp-subtext0">
                {PERIOD_TITLES[query.period]} sales summary{rangeLabel ? ` · ${rangeLabel}` : ""}
              </Text>
            </View>
            <Pressable
              onPress={close}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="h-9 w-9 items-center justify-center rounded-lg bg-ctp-mantle"
            >
              <StyledX size={18} className="text-ctp-text" />
            </Pressable>
          </View>

          {option(
            "pdf",
            StyledFileText,
            "PDF report",
            "Print-ready A4 summary: sales reconciliation, comparison with the previous period, payments, categories, top items, trend and peak hours.",
          )}
          {option(
            "csv",
            StyledFileSpreadsheet,
            "CSV spreadsheet",
            "Every figure as plain numbers for Excel or Google Sheets, including all items sold in the period.",
          )}

          {done ? <Text className="mt-1 font-inter-medium text-xs text-ctp-green">{done}</Text> : null}
          {error ? (
            <View className="mt-2 rounded-lg bg-ctp-red/15 p-3">
              <Text className="font-inter-medium text-xs text-ctp-red">{error}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

