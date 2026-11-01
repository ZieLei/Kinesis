
import { useCallback, useEffect, useState } from "react";

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
  return error instanceof Error
    ? error.message
    : fallback;
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

  const items: ManagedTerminal[] = terminals.items.map(
    (terminal) => {
      const metric = metricsByTerminal.get(terminal.id);

      return {
        ...terminal,
        websocket_connected:
          metric?.websocket_connected ?? false,
        latency_ms: metric?.latency_ms ?? null,
        latency_updated_at:
          metric?.latency_updated_at ?? null,
        connection_health:
          metric?.connection_health ?? "Unavailable",
        consecutive_ping_timeouts:
          metric?.consecutive_ping_timeouts ?? 0,
      };
    },
  );

  return {
    ...terminals,
    items,
  };
}


export function useTerminalManagement(
  search = "",
) {
  const [data, setData] =
    useState<TerminalListResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState("");
  const [metricsError, setMetricsError] = useState("");

  const [lastUpdated, setLastUpdated] =
    useState<Date | null>(null);

  const [metricsUpdatedAt, setMetricsUpdatedAt] =
    useState<string | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);


  // --------------------------------------------------
  // Load terminal information
  // --------------------------------------------------

  useEffect(() => {
    const controller = new AbortController();

    let cancelled = false;

    setLoading(true);
    setRefreshing(true);
    setError("");
    setMetricsError("");

    const timeout = window.setTimeout(() => {
      void loadTerminals();
    }, 250);


    async function loadTerminals() {
      try {
        const terminals = await fetchAdminTerminals(
          search,
          controller.signal,
        );

        if (cancelled) return;

        let result = terminals;

        try {
          const metrics =
            await fetchTerminalConnectionMetrics(
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


    return () => {
      cancelled = true;

      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [search, refreshKey]);


  // --------------------------------------------------
  // Live connection metric polling
  // --------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    let running = false;

    let activeController: AbortController | null = null;


    async function pollMetrics() {
      if (cancelled || running) return;

      running = true;

      const controller = new AbortController();

      activeController = controller;

      try {
        const metrics =
          await fetchTerminalConnectionMetrics(
            controller.signal,
          );

        if (cancelled) return;

        setData((current) => {
          if (!current) return current;

          return mergeConnectionMetrics(
            current,
            metrics,
          );
        });

        setMetricsUpdatedAt(metrics.measured_at);
        setMetricsError("");
      } catch (pollError) {
        if (
          !cancelled &&
          !controller.signal.aborted
        ) {
          setMetricsError(
            getErrorMessage(
              pollError,
              "Connection metrics could not be refreshed.",
            ),
          );
        }
      } finally {
        running = false;

        if (activeController === controller) {
          activeController = null;
        }
      }
    }


    const interval = window.setInterval(() => {
      void pollMetrics();
    }, 5000);


    return () => {
      cancelled = true;

      window.clearInterval(interval);
      activeController?.abort();
    };
  }, []);


  // --------------------------------------------------
  // Manual refresh
  // --------------------------------------------------

  const refresh = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);


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
