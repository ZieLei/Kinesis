
import { useEffect, useMemo } from "react";

import { useCatalog } from "@/app/context/CatalogContext";

export function useServices(searchQuery: string) {
  const {
    services,
    servicesLoading,
    servicesCreating,
    servicesLoadError,
    fetchServices,
    refreshServices,
    addService,
  } = useCatalog();

  // Load services when the Services screen first mounts.
  useEffect(() => {
    void fetchServices();
  }, [fetchServices]);

  const filteredServices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return services;
    }

    return services.filter((service) => {
      return (
        service.name.toLowerCase().includes(query) ||
        service.description.toLowerCase().includes(query)
      );
    });
  }, [services, searchQuery]);

  return {
    services: filteredServices,
    loading: servicesLoading,
    creating: servicesCreating,
    loadError: servicesLoadError,
    refreshServices,
    addService,
  };
}
