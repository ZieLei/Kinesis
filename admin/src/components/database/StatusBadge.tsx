import StatusDot, { type StatusTone } from "../ui/StatusDot";

const toneMap: Record<"green" | "yellow" | "red" | "blue" | "gray", StatusTone> = {
  green: "success",
  yellow: "warning",
  red: "danger",
  blue: "info",
  gray: "neutral",
};

/** Sentence-case status label with a coloured dot. */
export default function StatusBadge({
  label,
  tone = "yellow",
}: {
  label: string;
  tone?: "green" | "yellow" | "red" | "blue" | "gray";
}) {
  const text =
    label === label.toUpperCase()
      ? label.charAt(0) + label.slice(1).toLowerCase()
      : label;

  return (
    <StatusDot tone={toneMap[tone]} className="shrink-0">
      {text}
    </StatusDot>
  );
}
