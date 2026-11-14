import StatGrid from "@/components/ui/StatGrid";
import type { StockStatsSummary } from "@/lib/products";

type StockStatsProps = {
  stats: StockStatsSummary;
};

export default function StockStats({ stats }: StockStatsProps) {
  return (
    <StatGrid
      items={[
        { label: "Out of stock", value: stats.outOfStock },
        { label: "Low stock", value: stats.lowStock },
        { label: "Total items", value: stats.totalItems },
        { label: "Total products", value: stats.totalProducts },
      ]}
    />
  );
}
