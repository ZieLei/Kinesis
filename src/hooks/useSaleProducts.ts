import { useEffect, useMemo, useState } from "react";

import { ALL_CATEGORY } from "@/lib/products";
import type { Product } from "@/types/product";

/** Search and category filtering for the new-sale product list. */
export function useSaleProducts(products: Product[]) {
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const [searchQuery, setSearchQuery] = useState("");

  // Only categories that still have something in stock are offered.
  const categories = useMemo(
    () => [
      ALL_CATEGORY,
      ...Array.from(
        new Set(
          products
            .filter((product) => product.stock > 0)
            .map((product) => product.category),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    ],
    [products],
  );

  // Reset a removed category to All when inventory changes.
  useEffect(() => {
    if (
      selectedCategory !== ALL_CATEGORY &&
      !categories.includes(selectedCategory)
    ) {
      setSelectedCategory(ALL_CATEGORY);
    }
  }, [categories, selectedCategory]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory =
        selectedCategory === ALL_CATEGORY ||
        product.category === selectedCategory;

      const matchesSearch =
        product.name.toLowerCase().includes(normalizedQuery) ||
        (product.sku ?? "").toLowerCase().includes(normalizedQuery);

      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  return {
    categories,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    filteredProducts,
  };
}
