export default function StatusBadge({
  label,
  tone = "yellow",
}: {
  label: string;
  tone?: "green" | "yellow" | "red" | "blue" | "gray";
}) {
  const styles = {
    green: "bg-ctp-green/10 text-ctp-green",
    yellow: "bg-ctp-yellow/10 text-ctp-yellow",
    red: "bg-ctp-red/10 text-ctp-red",
    blue: "bg-ctp-blue/10 text-ctp-blue",
    gray: "bg-ctp-surface1 text-ctp-subtext0",
  };

  const dotStyles = {
    green: "bg-ctp-green",
    yellow: "bg-ctp-yellow",
    red: "bg-ctp-red",
    blue: "bg-ctp-blue",
    gray: "bg-ctp-overlay1",
  };

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 font-line-seed text-[10px] font-bold ${styles[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotStyles[tone]}`} />
      {label}
    </span>
  );
}
