// Shared visual vocabulary for Kinesis Admin.
// Derived from the Settings page; every page should build from these.

export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ctp-mauve";

const controlBase =
  "w-full min-w-0 rounded-md border border-ctp-surface1 bg-ctp-mantle px-3 py-1.5 text-sm text-ctp-text outline-none transition focus:border-ctp-mauve focus:ring-1 focus:ring-ctp-mauve disabled:cursor-not-allowed disabled:opacity-50";

export const inputClass = `${controlBase} placeholder:text-ctp-overlay0`;

export const selectClass = `${controlBase} appearance-none pr-9`;

export const labelClass = "block text-sm font-medium text-ctp-text";

const buttonBase = `inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;

export const buttonPrimary = `${buttonBase} bg-ctp-mauve text-ctp-base hover:brightness-110`;

export const buttonSecondary = `${buttonBase} border border-ctp-surface1 text-ctp-text hover:bg-ctp-surface0`;

export const buttonQuiet = `${buttonBase} text-ctp-subtext1 hover:bg-ctp-surface0 hover:text-ctp-text`;

export const buttonDanger = `${buttonBase} border border-ctp-red/40 text-ctp-red hover:bg-ctp-red/10`;

/** Solid destructive action, reserved for confirmations and server shutdown. */
export const buttonDangerSolid = `${buttonBase} bg-ctp-red text-ctp-base hover:brightness-110`;

/** Size modifier for dense rows (append after a button variant). */
export const buttonSmall = "!px-2.5 !py-1 !text-xs";

export const iconButton = `inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ctp-subtext1 transition hover:bg-ctp-surface0 hover:text-ctp-text disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;

export const tableHead =
  "px-3 py-2 text-left text-xs font-medium text-ctp-subtext0";

export const tableCell = "px-3 py-2.5 text-sm text-ctp-text";

/** Small secondary label used above values in key/value layouts. */
export const metaLabel = "text-xs text-ctp-subtext0";

export const navFocusRing = focusRing;
