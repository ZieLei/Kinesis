import type { MutableRefObject } from "react";
import { Text, View } from "react-native";

import type { CounterFrame } from "@/lib/counterScanner/types";

export type CounterCameraViewProps = {
  /** Camera runs only while true (the screen is focused). */
  active: boolean;
  /**
   * Filled by the camera with a function that grabs the current frame, or
   * null while no picture is available.
   */
  captureRef: MutableRefObject<(() => CounterFrame | null) | null>;
  onReadyChange?: (ready: boolean) => void;
};

// Fallback for native builds. Metro picks CounterCameraView.web.tsx in the
// browser, which is where the Counter Scanner runs.
export function CounterCameraView(_props: CounterCameraViewProps) {
  return (
    <View className="h-[280px] items-center justify-center rounded-xl border border-ctp-surface1 bg-ctp-mantle px-5">
      <Text className="text-center font-inter-medium text-sm text-ctp-subtext0">
        The Counter Scanner is available in the browser version of Kinesis.
      </Text>
    </View>
  );
}
