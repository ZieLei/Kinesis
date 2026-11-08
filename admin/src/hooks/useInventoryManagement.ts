import { useCallback, useEffect, useState } from "react";

import { fetchInventoryProducts } from "../lib/adminApi";
import type { InventoryListQuery, InventoryListResponse } from "../types/admin";


function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}


/**
 * Server-side paged inventory listing. Requests are debounced so typing in
 * the search box does not send a request per keystroke; the previous page
 * stays visible while the next one loads.
 */
export function useInventoryManagement(query: InventoryListQuery) {
  const [data, setData] = useState<InventoryListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { search, category, status, sort, direction, limit, offset, archived } = query;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      setRefreshing(true);

      try {
        const result = await fetchInventoryProducts(
          { search, category, status, sort, direction, limit, offset, archived },
          controller.signal,
        );

        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled && !controller.signal.aborted) {
          setError(getErrorMessage(caught, "Inventory could not be loaded."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, category, status, sort, direction, limit, offset, archived, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  return { data, loading, refreshing, error, refresh };
}
