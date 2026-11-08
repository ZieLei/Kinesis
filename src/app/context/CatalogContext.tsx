
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import * as productsApi from "@/lib/productsApi";
import * as servicesApi from "@/lib/serviceApi";
import * as inventoryApi from "@/lib/inventoryApi";

import type {
  Product,
  ProductCreate,
  ProductFormValues,
  ProductUpdate,
} from "@/types/product";
import type { Service, ServiceCreate } from "@/types/service";
import type {
  InventoryReceipt,
  InventoryReceiptCreate,
} from "@/types/inventory";

type CatalogContextValue = {
  inventory: Product[];
  inventoryLoading: boolean;
  inventoryRefreshing: boolean;
  inventoryLoadError: string;
  fetchInventory: (
    showLoader?: boolean,
    signal?: AbortSignal,
  ) => Promise<void>;
  refreshInventory: () => void;
  addProduct: (values: ProductFormValues) => Promise<Product>;
  saveProduct: (
    productId: number,
    values: ProductFormValues,
  ) => Promise<Product>;
  /** Archives a product (restorable by an administrator); never deletes it. */
  archiveProduct: (productId: number) => Promise<void>;
  receiveStock: (
    values: InventoryReceiptCreate,
  ) => Promise<InventoryReceipt>;

  services: Service[];
  servicesLoading: boolean;
  servicesCreating: boolean;
  servicesLoadError: string;
  fetchServices: (signal?: AbortSignal) => Promise<void>;
  refreshServices: () => void;
  addService: (values: ServiceCreate) => Promise<Service>;

  synchronizeCatalog: () => Promise<{
    productCount: number;
    serviceCount: number;
  }>;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error ? error.message : fallback;
}

type CatalogProviderProps = {
  children: ReactNode;
};

export function CatalogProvider({
  children,
}: CatalogProviderProps) {
  // --------------------------------------------------
  // Product inventory
  // --------------------------------------------------

  const [inventory, setInventory] = useState<Product[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryRefreshing, setInventoryRefreshing] = useState(false);
  const [inventoryLoadError, setInventoryLoadError] = useState("");

  const inventoryRequestId = useRef(0);

  const fetchInventory = useCallback(
    async (showLoader = true, signal?: AbortSignal) => {
      const requestId = ++inventoryRequestId.current;

      if (showLoader) {
        setInventoryLoading(true);
      }

      setInventoryLoadError("");

      try {
        const products = await productsApi.fetchAllProducts(signal);

        if (
          signal?.aborted ||
          requestId !== inventoryRequestId.current
        ) {
          return;
        }

        setInventory(products);
      } catch (error) {
        if (
          signal?.aborted ||
          requestId !== inventoryRequestId.current
        ) {
          return;
        }

        setInventoryLoadError(
          getErrorMessage(error, "Failed to load inventory."),
        );
      } finally {
        if (
          !signal?.aborted &&
          requestId === inventoryRequestId.current
        ) {
          setInventoryLoading(false);
          setInventoryRefreshing(false);
        }
      }
    },
    [],
  );

  const refreshInventory = useCallback(() => {
    if (inventoryLoading || inventoryRefreshing) {
      return;
    }

    setInventoryRefreshing(true);
    void fetchInventory(false);
  }, [
    fetchInventory,
    inventoryLoading,
    inventoryRefreshing,
  ]);

  const replaceProduct = useCallback((updated: Product) => {
    setInventory((previous) =>
      previous.map((product) =>
        product.id === updated.id ? updated : product,
      ),
    );
  }, []);

  const addProduct = useCallback(
    async (values: ProductFormValues): Promise<Product> => {
      const createData: ProductCreate = {
        name: values.name,
        category: values.category,
        price: values.price,
        stock: values.stock,
        initial_unit_cost: values.initial_unit_cost,
        sku: values.sku,
        howMuchSold: values.howMuchSold,
      };

      try {
        let createdProduct = await productsApi.createProduct(createData);

        setInventory((previous) => [
          ...previous,
          createdProduct,
        ]);

        if (values.image) {
          createdProduct = await productsApi.uploadProductImage(
            createdProduct.id,
            values.image,
          );

          replaceProduct(createdProduct);
        }

        return createdProduct;
      } catch (error) {
        // The server record might already exist if image upload failed.
        void fetchInventory(false);

        console.error("[Catalog] Product creation failed:", error);

        throw error;
      }
    },
    [fetchInventory, replaceProduct],
  );

  const saveProduct = useCallback(
    async (
      productId: number,
      values: ProductFormValues,
    ): Promise<Product> => {
      const updateData: ProductUpdate = {
        name: values.name,
        category: values.category,
        price: values.price,
        sku: values.sku,
      };

      try {
        const updatedProduct = await productsApi.updateProduct(
          productId,
          updateData,
        );

        replaceProduct(updatedProduct);

        let finalProduct = updatedProduct;

        if (values.image) {
          finalProduct = await productsApi.uploadProductImage(
            productId,
            values.image,
          );
        } else if (values.removeImage) {
          finalProduct = await productsApi.deleteProductImage(
            productId,
          );
        }

        replaceProduct(finalProduct);

        return finalProduct;
      } catch (error) {
        void fetchInventory(false);

        console.error("[Catalog] Product update failed:", error);

        throw error;
      }
    },
    [fetchInventory, replaceProduct],
  );

  const archiveProduct = useCallback(
    async (productId: number) => {
      await productsApi.archiveProduct(productId);

      // Archived products leave active inventory and sale lists.
      setInventory((previous) =>
        previous.filter((product) => product.id !== productId),
      );
    },
    [],
  );

  const receiveStock = useCallback(
    async (
      values: InventoryReceiptCreate,
    ): Promise<InventoryReceipt> => {
      const receipt = await inventoryApi.createInventoryReceipt(values);

      // The server calculates the new weighted-average cost.
      // Reload the authoritative product records after the receipt.
      await fetchInventory(false);

      return receipt;
    },
    [fetchInventory],
  );

  // --------------------------------------------------
  // Service catalog
  // --------------------------------------------------

  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesCreating, setServicesCreating] = useState(false);
  const [servicesLoadError, setServicesLoadError] = useState("");

  const servicesRequestId = useRef(0);

  const fetchServices = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = ++servicesRequestId.current;

      setServicesLoading(true);
      setServicesLoadError("");

      try {
        const result = await servicesApi.fetchAllServices(
          "",
          signal,
        );

        if (
          signal?.aborted ||
          requestId !== servicesRequestId.current
        ) {
          return;
        }

        setServices(result);
      } catch (error) {
        if (
          signal?.aborted ||
          requestId !== servicesRequestId.current
        ) {
          return;
        }

        setServicesLoadError(
          getErrorMessage(error, "Failed to load services."),
        );
      } finally {
        if (
          !signal?.aborted &&
          requestId === servicesRequestId.current
        ) {
          setServicesLoading(false);
        }
      }
    },
    [],
  );

  const refreshServices = useCallback(() => {
    void fetchServices();
  }, [fetchServices]);

  const addService = useCallback(
    async (values: ServiceCreate): Promise<Service> => {
      setServicesCreating(true);

      try {
        const created = await servicesApi.createService(values);

        setServices((previous) =>
          [
            ...previous.filter(
              (service) => service.id !== created.id,
            ),
            created,
          ].sort((a, b) => a.name.localeCompare(b.name)),
        );

        return created;
      } finally {
        setServicesCreating(false);
      }
    },
    [],
  );

  // --------------------------------------------------
  // Full catalog synchronization
  // --------------------------------------------------

  const synchronizeCatalog = useCallback(async () => {
    const productRequestId = ++inventoryRequestId.current;
    const serviceRequestId = ++servicesRequestId.current;

    setInventoryRefreshing(true);
    setServicesLoading(true);

    setInventoryLoadError("");
    setServicesLoadError("");

    try {
      // Neither catalog is committed to state unless both requests succeed.
      const [products, nextServices] = await Promise.all([
        productsApi.fetchAllProducts(),
        servicesApi.fetchAllServices(""),
      ]);

      if (productRequestId === inventoryRequestId.current) {
        setInventory(products);
      }

      if (serviceRequestId === servicesRequestId.current) {
        setServices(nextServices);
      }

      return {
        productCount: products.length,
        serviceCount: nextServices.length,
      };
    } catch (error) {
      const message = getErrorMessage(
        error,
        "The catalog could not be synchronized.",
      );

      if (productRequestId === inventoryRequestId.current) {
        setInventoryLoadError(message);
      }

      if (serviceRequestId === servicesRequestId.current) {
        setServicesLoadError(message);
      }

      throw error;
    } finally {
      if (productRequestId === inventoryRequestId.current) {
        setInventoryRefreshing(false);
      }

      if (serviceRequestId === servicesRequestId.current) {
        setServicesLoading(false);
      }
    }
  }, []);

  // --------------------------------------------------
  // Context value
  // --------------------------------------------------

  const value = useMemo<CatalogContextValue>(
    () => ({
      inventory,
      inventoryLoading,
      inventoryRefreshing,
      inventoryLoadError,
      fetchInventory,
      refreshInventory,
      addProduct,
      saveProduct,
      archiveProduct,
      receiveStock,

      services,
      servicesLoading,
      servicesCreating,
      servicesLoadError,
      fetchServices,
      refreshServices,
      addService,

      synchronizeCatalog,
    }),
    [
      inventory,
      inventoryLoading,
      inventoryRefreshing,
      inventoryLoadError,
      fetchInventory,
      refreshInventory,
      addProduct,
      saveProduct,
      archiveProduct,
      receiveStock,

      services,
      servicesLoading,
      servicesCreating,
      servicesLoadError,
      fetchServices,
      refreshServices,
      addService,

      synchronizeCatalog,
    ],
  );

  return (
    <CatalogContext.Provider value={value}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const context = useContext(CatalogContext);

  if (!context) {
    throw new Error(
      "useCatalog must be used inside CatalogProvider.",
    );
  }

  return context;
}
