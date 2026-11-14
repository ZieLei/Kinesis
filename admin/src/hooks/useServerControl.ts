import { useCallback, useEffect, useRef, useState } from "react";

import { fetchServerStatus, requestServerAction, setMaintenanceMode } from "../lib/serverApi";
import type { ServerAction, ServerStatus } from "../types/server";

const IDLE_POLL_MS = 5_000;
const BUSY_POLL_MS = 1_500;
/** How long a restart may take before the console says so. */
const RESTART_PATIENCE_MS = 90_000;
/** If the request is still unclaimed after this, the control service is not running. */
const UNCLAIMED_AFTER_MS = 15_000;

/**
 * What the console is doing about the server right now.
 *
 *  idle        nothing special (maintenance mode is separate: see status)
 *  restarting  a restart was accepted; waiting for the server to go away and
 *              come back with a newer start time
 *  stopping    a shutdown was accepted; waiting for the server to disappear
 *  stopped     the server is gone (shutdown finished); waiting for someone to
 *              start it again with `kinesisctl start`
 *  failed      the helper reported that the action did not work
 */
export type ServerPhase =
  | { kind: "idle" }
  | {
      kind: "restarting";
      requestId: string;
      since: number;
      startedAtBefore: string | null;
      sawDown: boolean;
    }
  | { kind: "stopping"; requestId: string; since: number }
  | { kind: "stopped"; since: number }
  | { kind: "failed"; action: ServerAction; message: string };

export type UseServerControl = {
  /** Last known status; null until the first answer. */
  status: ServerStatus | null;
  /** False while the server does not answer. */
  reachable: boolean;
  phase: ServerPhase;
  /** Set for a moment after a restart or an outage ends. */
  recoveredMessage: string;
  clearRecovered: () => void;
  dismissFailure: () => void;
  /** Returns an error message, or null when the request was accepted. */
  runAction: (action: ServerAction) => Promise<string | null>;
  /** Returns an error message, or null. */
  toggleMaintenance: (enabled: boolean) => Promise<string | null>;
  /** True while a restart seems stuck (no reply within the patience window). */
  restartOverdue: boolean;
  /** True while the request has not been picked up by the control service. */
  unclaimed: boolean;
  checkNow: () => void;
};

export function useServerControl(enabled: boolean): UseServerControl {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [reachable, setReachable] = useState(true);
  const [phase, setPhase] = useState<ServerPhase>({ kind: "idle" });
  const [recoveredMessage, setRecoveredMessage] = useState("");
  const [tick, setTick] = useState(0);

  const phaseRef = useRef(phase);
  const statusRef = useRef(status);

  useEffect(() => {
    phaseRef.current = phase;
    statusRef.current = status;
  });
  const consecutiveFailures = useRef(0);

  const evaluate = useCallback((next: ServerStatus | null) => {
    const current = phaseRef.current;
    const now = Date.now();

    if (next) {
      consecutiveFailures.current = 0;
    } else {
      consecutiveFailures.current += 1;
    }

    switch (current.kind) {
      case "restarting": {
        if (!next) {
          if (!current.sawDown) setPhase({ ...current, sawDown: true });
          return;
        }

        const last = next.control.last;

        if (last?.id === current.requestId && last.state === "failed") {
          setPhase({ kind: "failed", action: "restart", message: last.message ?? "The restart did not complete." });
          return;
        }

        // A new process start time is proof the restart happened, even if
        // the outage was too short for a poll to catch.
        if (next.server.started_at !== current.startedAtBefore) {
          setPhase({ kind: "idle" });
          setRecoveredMessage("The server restarted and is back online.");
        }

        return;
      }

      case "stopping": {
        if (!next) {
          // Two misses in a row: a single dropped request is not an outage.
          if (consecutiveFailures.current >= 2) setPhase({ kind: "stopped", since: now });
          return;
        }

        const last = next.control.last;

        if (last?.id === current.requestId && last.state === "failed") {
          setPhase({ kind: "failed", action: "shutdown", message: last.message ?? "The shutdown did not complete." });
        }

        return;
      }

      case "stopped": {
        if (next) {
          setPhase({ kind: "idle" });
          setRecoveredMessage("The server is running again.");
        }

        return;
      }

      default:
        return;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 4_000);
      let next: ServerStatus | null = null;

      try {
        next = await fetchServerStatus(controller.signal);
      } catch {
        next = null;
      } finally {
        window.clearTimeout(timeout);
      }

      if (cancelled) return;

      setReachable(next !== null);

      if (next) setStatus(next);

      evaluate(next);

      const busy = phaseRef.current.kind !== "idle" && phaseRef.current.kind !== "failed";
      timer = window.setTimeout(() => void poll(), busy ? BUSY_POLL_MS : IDLE_POLL_MS);
    };

    void poll();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, evaluate, tick]);

  const runAction = useCallback(async (action: ServerAction) => {
    try {
      const accepted = await requestServerAction(action);

      consecutiveFailures.current = 0;
      setPhase(
        action === "restart"
          ? {
              kind: "restarting",
              requestId: accepted.id,
              since: Date.now(),
              startedAtBefore: statusRef.current?.server.started_at ?? null,
              sawDown: false,
            }
          : { kind: "stopping", requestId: accepted.id, since: Date.now() },
      );

      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "The request failed.";
    }
  }, []);

  const toggleMaintenance = useCallback(async (value: boolean) => {
    try {
      setStatus(await setMaintenanceMode(value));
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Maintenance mode could not be changed.";
    }
  }, []);

  // A clock that only runs while busy, so elapsed-time hints stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (phase.kind === "idle" || phase.kind === "failed") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [phase.kind]);

  const sinceMs = phase.kind === "restarting" || phase.kind === "stopping" ? Math.max(0, now - phase.since) : 0;
  const pendingStill = Boolean(status?.control.pending);

  return {
    status,
    reachable,
    phase,
    recoveredMessage,
    clearRecovered: () => setRecoveredMessage(""),
    dismissFailure: () => setPhase({ kind: "idle" }),
    runAction,
    toggleMaintenance,
    restartOverdue: phase.kind === "restarting" && sinceMs > RESTART_PATIENCE_MS,
    unclaimed:
      (phase.kind === "restarting" || phase.kind === "stopping") &&
      sinceMs > UNCLAIMED_AFTER_MS &&
      pendingStill &&
      reachable,
    checkNow: () => setTick((n) => n + 1),
  };
}
