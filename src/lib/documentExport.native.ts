import { Share } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

/** Render HTML to a PDF file and open the share sheet (save, print, send). */
export async function exportPdf(html: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is unavailable on this device.");
  }

  const pdf = await Print.printToFileAsync({ html });

  if (!pdf.uri) {
    throw new Error("The PDF report could not be generated.");
  }

  await Sharing.shareAsync(pdf.uri, {
    mimeType: "application/pdf",
    dialogTitle: title,
    UTI: "com.adobe.pdf",
  });
}

/**
 * Share CSV text. The native build has no file-system module, so the CSV is
 * shared as text (paste into a spreadsheet, or save from the share target).
 */
export async function exportCsv(csv: string, fileName: string): Promise<void> {
  await Share.share({ title: fileName, message: csv.replace(/^﻿/, "") });
}
