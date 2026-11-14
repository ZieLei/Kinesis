/**
 * Label and badge colours for a sale status. Shared by the Transactions page
 * and the dashboard so a status always looks the same.
 */
export function getStatusPresentation(status: string) {
  switch (status.toLowerCase()) {
    case "completed":
    case "confirmed":
      return {
        label: status.toLowerCase() === "completed" ? "Completed" : "Confirmed",
        style: "bg-ctp-green/15 text-ctp-green",
      };
    case "pending":
      return {
        label: "Pending",
        style: "bg-ctp-yellow/15 text-ctp-yellow",
      };
    case "voided":
      return {
        label: "Voided",
        style: "bg-ctp-red/15 text-ctp-red",
      };
    case "refunded":
      return {
        label: "Refunded",
        style: "bg-ctp-peach/15 text-ctp-peach",
      };
    case "cancelled":
    case "canceled":
      return {
        label: "Cancelled",
        style: "bg-ctp-red/15 text-ctp-red",
      };
    default:
      return {
        label: status.charAt(0).toUpperCase() + status.slice(1),
        style: "bg-ctp-surface0 text-ctp-text",
      };
  }
}
