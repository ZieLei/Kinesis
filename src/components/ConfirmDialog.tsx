import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";

import { useDismissOnBack } from "@/hooks/useDismissOnBack";

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** Shown before the title, e.g. an icon in a tinted circle. */
  icon?: ReactNode;
  /** True while the action runs: buttons are disabled and back is ignored. */
  busy?: boolean;
  /** Error from the last attempt, shown inside the dialog. */
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Cross-platform confirmation dialog.
 *
 * React Native's Alert.alert is a no-op on web, so the browser terminals
 * never saw confirmations built on it. This renders the same on every
 * platform, closes on system back (useDismissOnBack), and keeps errors
 * in place so the cashier can retry or cancel.
 */
export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  icon,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancel = () => {
    if (!busy) onCancel();
  };

  useDismissOnBack(visible, cancel);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={cancel}
      statusBarTranslucent
    >
      <View className="flex-1 items-center justify-center px-6">
        <Pressable
          onPress={cancel}
          className="absolute inset-0 bg-black/50"
          accessibilityLabel="Dismiss dialog"
        />

        <View
          accessibilityRole="alert"
          className="w-full max-w-sm rounded-2xl bg-ctp-base p-5"
        >
          {icon ? <View className="mb-4">{icon}</View> : null}

          <Text className="font-inter-bold text-lg text-ctp-text">
            {title}
          </Text>

          <Text className="mt-2 font-inter-regular text-sm leading-6 text-ctp-subtext0">
            {message}
          </Text>

          {error ? (
            <View className="mt-4 rounded-xl bg-ctp-red/15 p-3">
              <Text className="font-inter-medium text-sm text-ctp-red">
                {error}
              </Text>
            </View>
          ) : null}

          <View className="mt-5 flex-row gap-3">
            <Pressable
              onPress={cancel}
              disabled={busy}
              accessibilityRole="button"
              className="min-h-12 flex-1 items-center justify-center rounded-xl border border-ctp-surface2 bg-ctp-mantle px-4"
            >
              <Text className="font-inter-semibold text-sm text-ctp-text">
                Cancel
              </Text>
            </Pressable>

            <Pressable
              onPress={onConfirm}
              disabled={busy}
              accessibilityRole="button"
              className="min-h-12 flex-1 flex-row items-center justify-center rounded-xl bg-ctp-blue px-4"
            >
              {busy ? (
                <ActivityIndicator size="small" color="#1E1E2E" />
              ) : (
                <Text className="font-inter-semibold text-sm text-ctp-crust">
                  {confirmLabel}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
