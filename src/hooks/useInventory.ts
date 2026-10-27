import { useCallback, useState } from "react";

import * as productsApi from "@/lib/productsApi";
import type { Product, ProductFormValues } from "@/types/product";

export function useInventory() {
  const [inventory, setInventory] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const fetchInventory = useCallback(
    async (showLoader = true, signal?: AbortSignal) => {
      if (showLoader) setLoading(true);

      setLoadError("");

      try {
        const products = await productsApi.fetchAllProducts(signal);

        if (signal?.aborted) return;

        setInventory(products);
      } catch (error) {
        if (signal?.aborted) return;

        setLoadError(
          error instanceof Error ? error.message : "Failed to load inventory.",
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [],
  );

  const refreshInventory = useCallback(() => {
    if (loading || refreshing) return;

    setRefreshing(true);
    void fetchInventory(false);
  }, [fetchInventory, loading, refreshing]);

  const replaceProduct = useCallback((updated: Product) => {
    setInventory((previous) =>
      previous.map((product) =>
        product.id === updated.id ? updated : product,
      ),
    );
  }, []);

  const addProduct = useCallback(
    async (values: ProductFormValues): Promise<Product> => {
      const { image, ...fields } = values;

      try {
        // Create the database record first to obtain its server-generated ID.
        let createdProduct = await productsApi.createProduct(fields);

        setInventory((previous) => [...previous, createdProduct]);

        // Upload the image only after the product exists.
        if (image) {
          createdProduct = await productsApi.uploadProductImage(
            createdProduct.id,
            image,
          );

          replaceProduct(createdProduct);
        }

        return createdProduct;
      } catch (error) {
        // The product may already exist if its image upload failed.
        void fetchInventory(false);

        console.error("[Stock] Create failed:", error);

        throw error;
      }
    },
    [fetchInventory, replaceProduct],
  );

  const saveProduct = useCallback(
    async (productId: number, values: ProductFormValues): Promise<Product> => {
      const { image, removeImage, ...fields } = values;

      try {
        const updatedProduct = await productsApi.updateProduct(
          productId,
          fields,
        );

        replaceProduct(updatedProduct);

        let finalProduct = updatedProduct;

        if (image) {
          finalProduct = await productsApi.uploadProductImage(productId, image);
        } else if (removeImage) {
          finalProduct = await productsApi.deleteProductImage(productId);
        }

        replaceProduct(finalProduct);

        return finalProduct;
      } catch (error) {
        void fetchInventory(false);

        console.error("[Stock] Save failed:", error);

        throw error;
      }
    },
    [fetchInventory, replaceProduct],
  );

  const removeProduct = useCallback(async (productId: number) => {
    await productsApi.deleteProduct(productId);

    setInventory((previous) =>
      previous.filter((product) => product.id !== productId),
    );
  }, []);

  return {
    inventory,
    loading,
    refreshing,
    loadError,
    fetchInventory,
    refreshInventory,
    addProduct,
    saveProduct,
    removeProduct,
  };
}
