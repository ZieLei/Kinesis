import { useEffect } from "react";
import { Platform } from "react-native";

const EDITABLE = 'input, textarea, select, [contenteditable="true"]';

/**
 * Web: keeps the focused text field visible above the on-screen keyboard.
 *
 * With interactive-widget=resizes-content (see +html.tsx) the page shrinks
 * when the keyboard opens, but a field inside a sheet's own scroll area can
 * still end up below the new bottom edge. On focus and on every viewport
 * resize, the focused field is scrolled into view if it is not already
 * fully visible. Native platforms handle this themselves; no-op there.
 */
export function useKeepFocusedFieldVisible() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const reveal = () => {
      clearTimeout(timer);

      // Let the keyboard finish resizing the viewport first.
      timer = setTimeout(() => {
        const field = document.activeElement;
        if (!(field instanceof HTMLElement) || !field.matches(EDITABLE)) return;

        // Visible band: the screen, narrowed to the field's scroll area
        // (a sheet's form scrolls between a header and pinned buttons).
        let top = 0;
        let bottom = window.visualViewport?.height ?? window.innerHeight;
        const scroller = scrollParent(field);

        if (scroller) {
          const area = scroller.getBoundingClientRect();
          top = Math.max(top, area.top);
          bottom = Math.min(bottom, area.bottom);
        }

        const rect = field.getBoundingClientRect();

        if (rect.top < top || rect.bottom > bottom) {
          field.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }, 150);
    };

    window.addEventListener("resize", reveal);
    window.visualViewport?.addEventListener("resize", reveal);
    document.addEventListener("focusin", reveal);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", reveal);
      window.visualViewport?.removeEventListener("resize", reveal);
      document.removeEventListener("focusin", reveal);
    };
  }, []);
}

/** Nearest ancestor that scrolls vertically, if any. */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);

    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
  }

  return null;
}
