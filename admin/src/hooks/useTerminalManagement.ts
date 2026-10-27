import { useCallback, useEffect, useRef, useState } from "react";

import { fetchAdminTerminals } from "../lib/terminalApi";
import type { TerminalListResponse } from "../types/terminal";

export function useTerminalManagement(
  token: string,
  search: string,
) {
  const [data, setData] = useState<TerminalListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const hasLoaded = useRef(false);

  useEffect(() => {
    if (!token.trim()) {
      setData(null);
      setLoading(false);
      setRefreshing(false);
      setError("");
      setLastUpdated(null);
      hasLoaded.current = false;
      return;
    }

    const controller = new AbortController();
    const initialLoad = !hasLoaded.current;

    setLoading(initialLoad);
    setRefreshing(!initialLoad);
    setError("");

    const timeout = window.setTimeout(() => {
      void fetchAdminTerminals(
        token,
        search,
        controller.signal,
      )
        .then((result) => {
          if (controller.signal.aborted) return;

          setData(result);
          setLastUpdated(new Date().toISOString());
          hasLoaded.current = true;
        })
        .catch((requestError: unknown) => {
          if (controller.signal.aborted) return;

          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load terminals.",
          );
        })
        .finally(() => {
          if (controller.signal.aborted) return;

          setLoading(false);
          setRefreshing(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [token, search, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  return {
    data,
    loading,
    refreshing,
    error,
    lastUpdated,
    refresh,
  };
}
