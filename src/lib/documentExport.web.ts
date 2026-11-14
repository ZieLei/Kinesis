/**
 * Browser document export.
 *
 * PDF: browsers cannot write a PDF directly, so the report HTML is printed
 * from an isolated iframe; the print dialog offers "Save as PDF" on
 * desktop, Android and iOS, and the document title becomes the suggested
 * file name. The iframe is sandboxed without "allow-scripts" (the report
 * is static, HTML-escaped markup); "allow-same-origin" lets this page call
 * print() on it and "allow-modals" permits the print dialog.
 *
 * CSV: a real file download through a temporary object URL. Following a
 * download link is navigation, not fetch(), so the POS Content Security
 * Policy (connect-src 'self') does not block it.
 */

export async function exportPdf(html: string, title: string): Promise<void> {
  if (typeof document === "undefined") {
    throw new Error("PDF export is only available in a browser.");
  }

  const frame = document.createElement("iframe");

  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.setAttribute("aria-hidden", "true");
  frame.title = title;
  Object.assign(frame.style, {
    position: "fixed",
    width: "0",
    height: "0",
    border: "0",
    right: "0",
    bottom: "0",
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("The report could not be prepared for printing."));
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
    throw new Error("The report could not be prepared for printing.");
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

export async function exportCsv(csv: string, fileName: string): Promise<void> {
  if (typeof document === "undefined") {
    throw new Error("CSV export is only available in a browser.");
  }

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);

  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
