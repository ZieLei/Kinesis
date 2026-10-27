import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import ChevronLeft from "lucide-react-native/icons/chevron-left";

import { styledIcon } from "@/components/StyledIcon";

const StyledChevronLeft = styledIcon(ChevronLeft);

type ScreenHeaderProps = {
  title: string;
  onBack: () => void;
  /** Optional right-hand action. An empty spacer keeps the title centered. */
  right?: ReactNode;
};

export default function ScreenHeader({
  title,
  onBack,
  right,
}: ScreenHeaderProps) {
  return (
    <View className="mb-5 flex-row items-center justify-between">
      <Pressable
        onPress={onBack}
        className="h-8 w-8 items-center justify-center"
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <StyledChevronLeft size={22} className="text-ctp-text" />
      </Pressable>

      <Text className="font-inter-semibold text-lg text-ctp-text">
        {title}
      </Text>

      {right ?? <View className="h-8 w-8" />}
    </View>
  );
}
