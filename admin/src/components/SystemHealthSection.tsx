import { useEffect, useState } from "react";

import Section from "./ui/Section";
import StatusDot from "./ui/StatusDot";
import Notice from "./ui/Notice";
import { fetchSystemHealth, type SystemHealth } from "../lib/adminApi";

const TONE = { ok: "success", warning: "warning", critical: "danger" } as const;

const REFRESH_MS = 60_000;

/** Database, migrations, backup freshness and disk space at a glance. */
export default function SystemHealthSection() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const load = () =>
      fetchSystemHealth(controller.signal)
        .then((result) => {
          setHealth(result);
          setError("");
        })
        .catch((caught: unknown) => {
          if (!controller.signal.aborted) {
            setError(caught instanceof Error ? caught.message : "Health checks failed.");
          }
        });

    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  return (
    <Section
      title="System health"
      description="Database, backups and disk space. Checked every minute."
      bodyClassName=""
    >
      {error && (
        <Notice tone="danger" role="alert">
          Health checks could not be loaded: {error}
        </Notice>
      )}

      {!health && !error && <p className="text-sm text-ctp-subtext0">Checking…</p>}

      {health && (
        <ul className="divide-y divide-ctp-surface0">
          {health.checks.map((item) => (
            <li key={item.id} className="flex flex-col gap-0.5 py-2">
              <StatusDot tone={TONE[item.status]}>{item.label}</StatusDot>
              <span className="pl-4 text-xs text-ctp-subtext0">{item.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
