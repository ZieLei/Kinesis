import { useCallback, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

/** Scrolled this far down (px) and the back-to-top button appears. */
export const SHOW_AFTER = 320;

type Scrollable = {
  scrollTo?: (options: { x?: number; y?: number; animated?: boolean }) => void;
  scrollToOffset?: (options: { offset: number; animated?: boolean }) => void;
};

/**
 * Drives a "back to top" button for a ScrollView or FlatList.
 *
 *   const top = useScrollToTop();
 *   <ScrollView ref={top.ref} onScroll={top.onScroll} scrollEventThrottle={16} />
 *   <ScrollToTopButton visible={top.visible} onPress={top.scrollToTop} />
 *
 * Lists driven by a Reanimated scroll handler cannot take `onScroll` as well:
 * call `scheduleOnRN(top.setVisible, y > SHOW_AFTER)` from the worklet when
 * the value changes instead.
 *
 * Only re-renders when the button has to appear or disappear, not on every
 * scroll event.
 */
export function useScrollToTop() {
  // Typed loosely so one ref fits ScrollView, FlatList and their animated
  // variants.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null);
  const [visible, setVisible] = useState(false);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = event.nativeEvent.contentOffset.y > SHOW_AFTER;
    setVisible((current) => (current === next ? current : next));
  }, []);

  const scrollToTop = useCallback(() => {
    const target = ref.current as Scrollable | null;
    if (target?.scrollToOffset) target.scrollToOffset({ offset: 0, animated: true });
    else target?.scrollTo?.({ y: 0, animated: true });
  }, []);

  return { ref, onScroll, scrollEventThrottle: 16, visible, setVisible, scrollToTop };
}
