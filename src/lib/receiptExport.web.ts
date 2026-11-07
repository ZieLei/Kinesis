/**
 * Browser receipt export.
 *
 * Browsers cannot write a PDF file directly, and expo-print's web
 * printToFileAsync only prints the whole application page. Instead the
 * receipt HTML is printed from an isolated iframe; the browser's print
 * dialog offers "Save as PDF" on desktop, Android and iOS.
 *
 * The iframe is sandboxed without "allow-scripts", so even if receipt data
 * contained markup (it is HTML-escaped by createReceiptHtml) no script in
 * it could run. "allow-same-origin" is required for the parent page to call
 * print() on the frame; "allow-modals" permits the print dialog.
 */
export async function exportReceipt(
  html: string,
  title: string,
): Promise<void> {
  if (typeof document === "undefined") {
    throw new Error("Receipt printing is only available in a browser.");
  }

  const frame = document.createElement("iframe");

  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.setAttribute("aria-hidden", "true");
  frame.title = title;
  frame.style.position = "fixed";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.right = "0";
  frame.style.bottom = "0";

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("The receipt could not be prepared for printing."));
    }, 10_000);

    frame.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };

    frame.srcdoc = html;
    document.body.appendChild(frame);
  });

  const printWindow = frame.contentWindow;

  if (!printWindow) {
    frame.remove();
    throw new Error("The receipt could not be prepared for printing.");
  }

  try {
    printWindow.document.title = title;
    printWindow.focus();
    printWindow.print();
  } finally {
    // print() blocks until the dialog closes in most browsers; Safari
    // returns early, so keep the frame briefly before removing it.
    window.setTimeout(() => frame.remove(), 60_000);
  }
}
