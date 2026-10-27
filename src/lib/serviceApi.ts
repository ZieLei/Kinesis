

import { apiRequest } from "@/lib/api";
import type {
  Service,
  ServiceCreate,
  ServicesResponse,
} from "@/types/service";

const PAGE_SIZE = 100;

export async function fetchAllServices(
  search = "",
  signal?: AbortSignal,
): Promise<Service[]> {
  const services: Service[] = [];
  let offset = 0;
  let totalCount = Number.POSITIVE_INFINITY;

  while (offset < totalCount) {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });

    if (search.trim()) {
      params.set("search", search.trim());
    }

    const response = await apiRequest<ServicesResponse>(
      `/api/services?${params.toString()}`,
      { signal },
    );

    if (
      !Array.isArray(response.items) ||
      typeof response.count !== "number"
    ) {
      throw new Error("The server returned an unexpected services response.");
    }

    services.push(...response.items);
    totalCount = response.count;

    if (
      response.items.length === 0 ||
      services.length >= totalCount ||
      response.items.length < PAGE_SIZE
    ) {
      break;
    }

    offset += response.items.length;
  }

  return services;
}

export function createService(
  data: ServiceCreate,
): Promise<Service> {
  return apiRequest<Service>("/api/services", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
