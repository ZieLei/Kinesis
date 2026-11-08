import { useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";

/**
 * Makes the system back action close an open modal, sheet or dialog first,
 * before it navigates away from the screen underneath.
 *
 * Native (Android): while visible, the hardware/gesture back press runs
 * `onClose()` instead of navigating. Real modals (React Native <Modal>, the
 * native bottom sheet) already consume the press in their own window, so
 * this only takes effect for in-screen steps such as login's PIN entry.
 *
 * Web (browser terminals, installed PWA): an overlay is not part of browser
 * history, so Android's back gesture / the browser back button would skip
 * it and leave the screen with the overlay still open. While the overlay is
 * visible this hook keeps one same-URL history entry on top of the stack:
 *
 *   - back pops that entry → `onClose()` runs, the URL and the navigation
 *     state are untouched, and the router never sees the event;
 *   - closing the overlay any other way (✕, Save, tapping outside) removes
 *     the entry again, so the next back navigates normally.
 *
 * Overlays opened on top of each other each get their own entry, so back
 * closes them one at a time, newest first.
 */
export function useDismissOnBack(visible: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!visible) return;

    if (Platform.OS !== "web") {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          onCloseRef.current();
          return true;
        },
      );
      return () => subscription.remove();
    }

    if (typeof window === "undefined") return;

    const token = `kinesis-overlay-${Math.random().toString(36).slice(2)}`;
    let entryOnTop = true;

    // Same URL, router state preserved; only our marker is added.
    window.history.pushState(
      { ...(window.history.state ?? {}), kinesisOverlay: token },
      "",
    );

    const onPopState = (event: PopStateEvent) => {
      if (!entryOnTop) return;

      // We have just left our own entry: this back press belongs to the
      // overlay. Stop the router's popstate listener from treating it as
      // navigation (capture listeners on window run before it).
      entryOnTop = false;
      event.stopImmediatePropagation();
      onCloseRef.current();
    };

    window.addEventListener("popstate", onPopState, { capture: true });

    return () => {
      window.removeEventListener("popstate", onPopState, { capture: true });

      // Closed by the UI (or the screen unmounted) while our entry is still
      // the current one: step back over it so it can't swallow a later back.
      if (entryOnTop && window.history.state?.kinesisOverlay === token) {
        const swallow = (event: PopStateEvent) => {
          event.stopImmediatePropagation();
        };

        window.addEventListener("popstate", swallow, {
          capture: true,
          once: true,
        });
        window.history.back();
      }
    };
  }, [visible]);
}
