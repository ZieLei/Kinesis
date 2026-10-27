import { useMemo, useState } from "react";

import type {
  FilterSection,
  FilterValues,
} from "@/components/modals/FilterModal";
import { ALL_CATEGORY, LOW_STOCK_THRESHOLD } from "@/lib/products";
import type { Product } from "@/types/product";

const createDefaultFilters = (): FilterValues => ({
  inventoryOptions: ["status:all"],
});

const FILTER_SECTIONS: FilterSection[] = [
  {
    key: "inventoryOptions",
    title: "Inventory Options",
    type: "multiple",
    options: [
      { label: "All items", value: "status:all" },
      { label: "Low stock", value: "status:low" },
      { label: "Out of stock", value: "status:out" },
      { label: "Stock: Low to high", value: "sort:stock-low-high" },
      { label: "Stock: High to low", value: "sort:stock-high-low" },
      { label: "Price: High to low", value: "sort:price-desc" },
      { label: "Name: A to Z", value: "sort:name-asc" },
    ],
  },
  {
    key: "priceRange",
    title: "Price Range (₱)",
    type: "range",
  },
];

export function useStockFilters(inventory: Product[]) {
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterVisible, setFilterVisible] = useState(false);
  const [activeFilters, setActiveFilters] =
    useState<FilterValues>(createDefaultFilters);

  const categories = useMemo(
    () => [ALL_CATEGORY, ...new Set(inventory.map((product) => product.category))],
    [inventory],
  );

  const filteredProducts = useMemo(() => {
    const options = activeFilters.inventoryOptions ?? [];

    const selectedStatus =
      options.find((value) => value.startsWith("status:")) ?? "status:all";

    const selectedSort = options.find((value) => value.startsWith("sort:"));

    const minText = activeFilters.priceRange?.[0] ?? "";
    const maxText = activeFilters.priceRange?.[1] ?? "";

    const minPrice = minText.trim() === "" ? null : Number(minText);
    const maxPrice = maxText.trim() === "" ? null : Number(maxText);
    const normalizedSearch = searchQuery.trim().toLowerCase();

    const result = inventory.filter((product) => {
      const matchesCategory =
        selectedCategory === ALL_CATEGORY ||
        product.category === selectedCategory;

      const matchesSearch =
        product.name.toLowerCase().includes(normalizedSearch) ||
        (product.sku ?? "").toLowerCase().includes(normalizedSearch);

      const matchesStatus =
        selectedStatus === "status:low"
          ? product.stock > 0 && product.stock < LOW_STOCK_THRESHOLD
          : selectedStatus === "status:out"
            ? product.stock === 0
            : true;

      const matchesMinPrice =
        minPrice === null ||
        (Number.isFinite(minPrice) && product.price >= minPrice);

      const matchesMaxPrice =
        maxPrice === null ||
        (Number.isFinite(maxPrice) && product.price <= maxPrice);

      return (
        matchesCategory &&
        matchesSearch &&
        matchesStatus &&
        matchesMinPrice &&
        matchesMaxPrice
      );
    });

    return result.sort((a, b) => {
      switch (selectedSort) {
        case "sort:stock-low-high":
          return a.stock - b.stock;
        case "sort:stock-high-low":
          return b.stock - a.stock;
        case "sort:price-desc":
          return b.price - a.price;
        case "sort:name-asc":
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
  }, [inventory, selectedCategory, searchQuery, activeFilters]);

  const activeFilterCount = Object.entries(activeFilters).reduce(
    (total, [key, values]) => {
      if (key === "soldRange" && values.includes("all")) return total;

      if (key === "inventoryOptions") {
        return total + values.filter((value) => value !== "status:all").length;
      }

      return total + values.length;
    },
    0,
  );

  const resetFilters = () => {
    setActiveFilters(createDefaultFilters());
  };

  return {
    categories,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    filterVisible,
    setFilterVisible,
    activeFilters,
    setActiveFilters,
    resetFilters,
    filterSections: FILTER_SECTIONS,
    filteredProducts,
    activeFilterCount,
  };
}
