import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";

type SnackbarProps = {
  /** Message to show; null hides the snackbar. */
  message: string | null;
  onHide: () => void;
  /** How long the message stays up, in milliseconds. */
  duration?: number;
};

/**
 * Brief, non-blocking status message at the bottom of the screen
 * (e.g. "Product archived"). Announced to screen readers, dismissible by
 * tapping, and works on web where Alert.alert does nothing.
 */
export default function Snackbar({
  message,
  onHide,
  duration = 4000,
}: SnackbarProps) {
  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(onHide, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onHide]);

  if (!message) return null;

  return (
    <View
      pointerEvents="box-none"
      className="absolute bottom-24 left-5 right-5 items-center"
    >
      <Pressable
        onPress={onHide}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityHint="Tap to dismiss"
        className="w-full max-w-md rounded-xl bg-ctp-text px-4 py-3 shadow-lg"
      >
        <Text className="font-inter-medium text-sm leading-5 text-ctp-base">
          {message}
        </Text>
      </Pressable>
    </View>
  );
}
