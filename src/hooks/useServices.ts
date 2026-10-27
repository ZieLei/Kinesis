

import { useCallback, useEffect, useState } from "react";

import * as servicesApi from "@/lib/serviceApi";
import type { Service, ServiceCreate } from "@/types/service";

export function useServices(searchQuery: string) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setLoadError("");

    // Debounce search input to avoid sending a request on every keystroke.
    const timeout = setTimeout(() => {
      void servicesApi
        .fetchAllServices(searchQuery, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) {
            setServices(result);
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;

          setLoadError(
            error instanceof Error
              ? error.message
              : "Failed to load services.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [searchQuery, reloadKey]);

  const refreshServices = useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

  const addService = useCallback(
    async (values: ServiceCreate): Promise<Service> => {
      setCreating(true);

      try {
        const created = await servicesApi.createService(values);

        setServices((current) => [
          created,
          ...current.filter((service) => service.id !== created.id),
        ]);

        setReloadKey((current) => current + 1);

        return created;
      } finally {
        setCreating(false);
      }
    },
    [],
  );

  return {
    services,
    loading,
    creating,
    loadError,
    refreshServices,
    addService,
  };
}
