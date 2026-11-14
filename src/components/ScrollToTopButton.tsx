import { useEffect, useRef } from "react";
import { Animated, Pressable } from "react-native";

import ArrowUp from "lucide-react-native/icons/arrow-up";

import { styledIcon } from "@/components/StyledIcon";

const StyledArrowUp = styledIcon(ArrowUp);

type Props = {
  visible: boolean;
  onPress: () => void;
  /** Extra distance from the bottom edge, e.g. above a pagination bar. */
  bottom?: number;
};

/**
 * Round arrow-up button pinned to the bottom-right of its (relatively
 * positioned) parent. Fades in once the list is scrolled down.
 */
export default function ScrollToTopButton({ visible, onPress, bottom = 16 }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  return (
    <Animated.View
      pointerEvents={visible ? "box-none" : "none"}
      style={{ opacity, position: "absolute", right: 16, bottom, zIndex: 50 }}
    >
      <Pressable
        onPress={onPress}
        disabled={!visible}
        accessibilityRole="button"
        accessibilityLabel="Scroll to top"
        hitSlop={8}
        className="h-11 w-11 items-center justify-center rounded-full border border-ctp-surface1 bg-ctp-mantle active:opacity-70"
        style={{ boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.18)" }}
      >
        <StyledArrowUp size={20} className="text-ctp-text" />
      </Pressable>
    </Animated.View>
  );
}
