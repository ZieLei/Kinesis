
import { useEffect, useState } from "react";

import {
  fetchAdminTerminals,
  fetchTerminalConnectionMetrics,
} from "../lib/terminalApi";

import type {
  ManagedTerminal,
  TerminalConnectionMetricsResponse,
  TerminalListResponse,
} from "../types/terminal";

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error ? error.message : fallback;
}

function mergeConnectionMetrics(
  terminals: TerminalListResponse,
  metrics: TerminalConnectionMetricsResponse,
): TerminalListResponse {
  const metricsByTerminal = new Map(
    metrics.items.map((item) => [
      item.terminal_id,
      item,
    ]),
  );

  const items: ManagedTerminal[] = terminals.items.map((terminal) => {
    const metric = metricsByTerminal.get(terminal.id);

    return {
      ...terminal,
      websocket_connected: metric?.websocket_connected ?? false,
      latency_ms: metric?.latency_ms ?? null,
      latency_updated_at: metric?.latency_updated_at ?? null,
      connection_health:
        metric?.connection_health ?? "Unavailable",
      consecutive_ping_timeouts:
        metric?.consecutive_ping_timeouts ?? 0,
    };
  });

  return {
    ...terminals,
    items,
  };
}

export function useTerminalManagement(
  token: string | null,
  search = "",
) {
  const [data, setData] =
    useState<TerminalListResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");
  const [metricsError, setMetricsError] = useState("");

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [metricsUpdatedAt, setMetricsUpdatedAt] =
    useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  // --------------------------------------------------
  // Terminal list
  // --------------------------------------------------

  useEffect(() => {
    if (!token) {
      setData(null);
      setLoading(false);
      setRefreshing(false);
      setError("");
      setMetricsError("");
      setLastUpdated(null);
      setMetricsUpdatedAt(null);
      return;
    }

    // Preserve the non-null type inside asynchronous callbacks.
    const activeToken: string = token;

    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    setRefreshing(true);
    setError("");
    setMetricsError("");

    const timeout = setTimeout(() => {
      async function loadTerminals() {
        try {
          const terminals = await fetchAdminTerminals(
            activeToken,
            search,
            controller.signal,
          );

          if (cancelled) return;

          let result = terminals;

          try {
            const metrics = await fetchTerminalConnectionMetrics(
              activeToken,
              controller.signal,
            );

            if (cancelled) return;

            result = mergeConnectionMetrics(
              terminals,
              metrics,
            );

            setMetricsUpdatedAt(metrics.measured_at);
            setMetricsError("");
          } catch (metricsFetchError) {
            if (cancelled) return;

            setMetricsError(
              getErrorMessage(
                metricsFetchError,
                "Connection metrics could not be loaded.",
              ),
            );

            result = mergeConnectionMetrics(
              terminals,
              {
                items: [],
                measured_at: "",
              },
            );
          }

          if (cancelled) return;

          setData(result);
          setLastUpdated(new Date());
        } catch (fetchError) {
          if (cancelled) return;

          setError(
            getErrorMessage(
              fetchError,
              "Could not load terminal information.",
            ),
          );
        } finally {
          if (!cancelled) {
            setLoading(false);
            setRefreshing(false);
          }
        }
      }

      void loadTerminals();
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [token, search, refreshKey]);

  // --------------------------------------------------
  // Live connection metric polling
  // --------------------------------------------------

  useEffect(() => {
    if (!token) {
      return;
    }

    // Preserve the non-null type inside the polling callback.
    const activeToken: string = token;

    let cancelled = false;
    let running = false;

    const controller = new AbortController();

    async function pollMetrics() {
      if (cancelled || running) return;

      running = true;

      try {
        const metrics = await fetchTerminalConnectionMetrics(
          activeToken,
          controller.signal,
        );

        if (cancelled) return;

        setData((current) => {
          if (!current) return current;

          return mergeConnectionMetrics(current, metrics);
        });

        setMetricsUpdatedAt(metrics.measured_at);
        setMetricsError("");
      } catch (pollError) {
        if (!cancelled && !controller.signal.aborted) {
          setMetricsError(
            getErrorMessage(
              pollError,
              "Connection metrics could not be refreshed.",
            ),
          );
        }
      } finally {
        running = false;
      }
    }

    const interval = setInterval(() => {
      void pollMetrics();
    }, 5_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      controller.abort();
    };
  }, [token]);

  const refresh = () => {
    setRefreshKey((current) => current + 1);
  };

  return {
    data,
    loading,
    refreshing,
    error,
    metricsError,
    lastUpdated,
    metricsUpdatedAt,
    refresh,
  };
}
