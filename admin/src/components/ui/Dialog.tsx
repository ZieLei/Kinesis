import { useEffect, type ReactNode } from "react";

export default function Dialog({
  open = true,
  onClose,
  title,
  description,
  children,
  footer,
  role = "dialog",
  labelledBy = "dialog-title",
  describedBy,
  size = "md",
  dismissible = true,
}: {
  open?: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  role?: "dialog" | "alertdialog";
  labelledBy?: string;
  describedBy?: string;
  size?: "sm" | "md" | "lg";
  dismissible?: boolean;
}) {
  useEffect(() => {
    if (!open || !dismissible) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, dismissible, onClose]);

  if (!open) return null;

  const width = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" }[size];
  const descriptionId = describedBy ?? (description ? `${labelledBy}-description` : undefined);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-ctp-crust/60 p-4 font-line-seed"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={descriptionId}
        className={`my-auto w-full ${width} rounded-lg border border-ctp-surface1 bg-ctp-mantle shadow-lg`}
      >
        <div className="border-b border-ctp-surface0 px-5 py-4">
          <h2 id={labelledBy} className="text-sm font-semibold text-ctp-text">
            {title}
          </h2>
          {description && (
            <p
              id={describedBy ? undefined : descriptionId}
              className="mt-1 text-xs leading-relaxed text-ctp-subtext0"
            >
              {description}
            </p>
          )}
        </div>

        {children && <div className="px-5 py-4">{children}</div>}

        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-ctp-surface0 px-5 py-3">
            {footer}
          </div>
        )}
      </section>
    </div>
  );
}
