import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchNotifications } from "../lib/serverApi";
import type { AdminNotification } from "../types/server";

const POLL_MS = 60_000;
const STORAGE_KEY = "kinesis-admin-dismissed-notifications";
const KEEP = 200;

function loadDismissed(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/**
 * The alerts behind the bell. They are computed by the server from live data;
 * dismissing one is remembered in this browser by its id, and the id changes
 * when the situation does, so a dismissed alert returns when something new
 * happens.
 */
export function useNotifications(enabled: boolean) {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>(loadDismissed);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetchNotifications(signal);
      setItems(response.items);
      setFailed(false);
    } catch {
      if (!signal?.aborted) setFailed(true);
    } finally {
      if (!signal?.aborted) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = window.setInterval(() => void refresh(controller.signal), POLL_MS);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [enabled, refresh]);

  const remember = useCallback((ids: string[]) => {
    setDismissed((current) => {
      const next = [...new Set([...ids, ...current])].slice(0, KEEP);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Dismissals then last until the page is reloaded.
      }

      return next;
    });
  }, []);

  const visible = useMemo(() => items.filter((item) => !dismissed.includes(item.id)), [items, dismissed]);

  return {
    items: visible,
    loaded,
    failed,
    refresh: () => void refresh(),
    dismiss: (id: string) => remember([id]),
    dismissAll: () => remember(items.map((item) => item.id)),
  };
}
