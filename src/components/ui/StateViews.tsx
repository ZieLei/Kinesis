import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

/**
 * Shared full-area loading, empty and error states, so every list screen
 * reads the same way: a spinner with a message, a quiet empty message, or a
 * red message with a Retry button.
 */

export function LoadingState({ message }: { message: string }) {
  return (
    <View
      className="flex-1 items-center justify-center gap-3"
      accessibilityRole="progressbar"
      accessibilityLabel={message}
    >
      <ActivityIndicator size="large" color="#89B4FA" />
      <Text className="font-inter-medium text-sm text-ctp-subtext0">
        {message}
      </Text>
    </View>
  );
}

export function EmptyState({
  message,
  icon,
}: {
  message: string;
  icon?: ReactNode;
}) {
  return (
    <View className="flex-1 items-center justify-center px-5 py-10">
      {icon}
      <Text className="mt-3 text-center font-inter-medium text-sm text-ctp-subtext0">
        {message}
      </Text>
    </View>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View
      className="flex-1 items-center justify-center px-5 py-10"
      accessibilityRole="alert"
    >
      <Text className="text-center font-inter-semibold text-base text-ctp-red">
        {title}
      </Text>
      {message ? (
        <Text className="mt-2 text-center font-inter-regular text-sm leading-5 text-ctp-subtext0">
          {message}
        </Text>
      ) : null}
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          className="mt-4 rounded-lg border border-ctp-surface1 bg-ctp-surface0 px-4 py-2.5"
        >
          <Text className="font-inter-semibold text-sm text-ctp-text">Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
