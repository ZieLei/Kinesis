
import { useCatalog } from "@/app/context/CatalogContext";

export function useInventory() {
  const {
    inventory,
    inventoryLoading,
    inventoryRefreshing,
    inventoryLoadError,
    fetchInventory,
    refreshInventory,
    addProduct,
    saveProduct,
    removeProduct,
  } = useCatalog();

  return {
    inventory,
    loading: inventoryLoading,
    refreshing: inventoryRefreshing,
    loadError: inventoryLoadError,
    fetchInventory,
    refreshInventory,
    addProduct,
    saveProduct,
    removeProduct,
  };
}
