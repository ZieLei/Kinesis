/** "09171234567" → "0917 123 4567" for reading aloud and typing into GCash. */
export function formatGcashNumber(number: string | null | undefined): string {
  const digits = (number ?? "").replace(/\D/g, "");

  if (digits.length !== 11) return number ?? "";

  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}
