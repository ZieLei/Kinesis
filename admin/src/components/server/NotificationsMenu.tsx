import { Bell, BellOff, CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { buttonQuiet, buttonSmall, focusRing, iconButton } from "../ui/styles";
import type { AdminNotification, NotificationSeverity } from "../../types/server";

const dotClass: Record<NotificationSeverity, string> = {
  critical: "text-ctp-red",
  warning: "text-ctp-yellow",
  info: "text-ctp-blue",
};

const SeverityIcon = ({ severity }: { severity: NotificationSeverity }) => {
  const Icon = severity === "critical" ? CircleAlert : severity === "warning" ? TriangleAlert : Info;
  return <Icon size={15} className={`mt-0.5 shrink-0 ${dotClass[severity]}`} aria-hidden="true" />;
};

export default function NotificationsMenu({
  items,
  loaded,
  failed,
  onOpen,
  onDismiss,
  onDismissAll,
  onNavigate,
}: {
  items: AdminNotification[];
  loaded: boolean;
  failed: boolean;
  onOpen: () => void;
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  onNavigate: (tab: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const critical = items.some((item) => item.severity === "critical");
  const count = items.length;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={count > 0 ? `Notifications, ${count} need attention` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Notifications"
        onClick={() => {
          if (!open) onOpen();
          setOpen((value) => !value);
        }}
        className={`${iconButton} relative`}
      >
        <Bell size={16} />
        {count > 0 && (
          <span
            aria-hidden="true"
            className={`absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-4 text-ctp-base ${critical ? "bg-ctp-red" : "bg-ctp-yellow"}`}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-[70] mt-1.5 w-[22rem] max-w-[calc(100vw-2rem)] rounded-md border border-ctp-surface1 bg-ctp-mantle text-left shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-ctp-surface0 px-3 py-2">
            <p className="text-sm font-medium text-ctp-text">Notifications</p>
            {count > 0 && (
              <button type="button" onClick={onDismissAll} className={`${buttonQuiet} ${buttonSmall}`}>
                Dismiss all
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto overscroll-contain">
            {!loaded ? (
              <p className="px-3 py-6 text-center text-sm text-ctp-subtext0">Loading…</p>
            ) : failed && count === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ctp-subtext0">
                Notifications could not be loaded. They refresh every minute.
              </p>
            ) : count === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-3 py-8 text-center">
                <BellOff size={20} className="text-ctp-overlay1" aria-hidden="true" />
                <p className="text-sm font-medium text-ctp-text">You&rsquo;re all caught up</p>
                <p className="text-xs text-ctp-subtext0">Low stock, offline terminals and system problems show up here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-ctp-surface0">
                {items.map((item) => (
                  <li key={item.id} className="flex items-start gap-1 pr-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate(item.target);
                        setOpen(false);
                      }}
                      className={`flex min-w-0 flex-1 items-start gap-2.5 rounded px-3 py-2.5 text-left transition hover:bg-ctp-surface0 ${focusRing}`}
                    >
                      <SeverityIcon severity={item.severity} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ctp-text">{item.title}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-ctp-subtext0">{item.detail}</span>
                      </span>
                    </button>

                    <button
                      type="button"
                      aria-label={`Dismiss ${item.title}`}
                      onClick={() => onDismiss(item.id)}
                      className={`${iconButton} mt-1.5 !size-6`}
                    >
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
