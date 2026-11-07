import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

/**
 * Render the (already HTML-escaped) receipt to a PDF file and open the
 * system share sheet.
 */
export async function exportReceipt(
  html: string,
  title: string,
): Promise<void> {
  const sharingAvailable = await Sharing.isAvailableAsync();

  if (!sharingAvailable) {
    throw new Error("PDF sharing is unavailable on this device.");
  }

  const pdf = await Print.printToFileAsync({ html });

  if (!pdf.uri) {
    throw new Error("The PDF receipt could not be generated.");
  }

  await Sharing.shareAsync(pdf.uri, {
    mimeType: "application/pdf",
    dialogTitle: title,
    UTI: "com.adobe.pdf",
  });
}
