import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useColorScheme } from "nativewind";

import { useDismissOnBack } from "@/hooks/useDismissOnBack";
import type {
  ReversalKind,
  ReversalReasonCode,
  SaleReversalRequest,
} from "@/types/sale";

export const REVERSAL_REASONS: { code: ReversalReasonCode; label: string }[] = [
  { code: "customer_changed_mind", label: "Customer changed their mind" },
  { code: "wrong_item", label: "Wrong item sold" },
  { code: "cashier_error", label: "Cashier error" },
  { code: "defective_item", label: "Defective item" },
  { code: "duplicate_sale", label: "Duplicate sale" },
  { code: "pricing_dispute", label: "Pricing dispute" },
  { code: "other", label: "Other" },
];

type ReverseSaleSheetProps = {
  visible: boolean;
  transactionCode: string;
  onClose: () => void;
  onSubmit: (request: SaleReversalRequest) => Promise<void>;
};

export default function ReverseSaleSheet({
  visible,
  transactionCode,
  onClose,
  onSubmit,
}: ReverseSaleSheetProps) {
  // Mount this only while it is open (see receipt.tsx) so the form starts
  // fresh every time.
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const [kind, setKind] = useState<ReversalKind>("void");
  const [reason, setReason] = useState<ReversalReasonCode | null>(null);
  const [note, setNote] = useState("");
  const [returnToStock, setReturnToStock] = useState(true);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (!saving) onClose();
  };

  useDismissOnBack(visible, close);

  const submit = async () => {
    if (saving) return;

    if (!reason) {
      setError("Choose a reason.");
      return;
    }

    if (reason === "other" && !note.trim()) {
      setError("Describe the reason when choosing 'Other'.");
      return;
    }

    if (username.trim().length < 3 || !/^\d{6}$/.test(pin)) {
      setError("Enter the supervisor username and 6-digit PIN.");
      return;
    }

    setError("");
    setSaving(true);

    try {
      await onSubmit({
        kind,
        reason_code: reason,
        note: note.trim() || undefined,
        return_to_stock: kind === "void" ? true : returnToStock,
        supervisor_username: username.trim(),
        supervisor_pin: pin,
      });
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The reversal could not be saved.",
      );
      setSaving(false);
    }
  };

  const placeholderColor = isDark ? "#A6ADC8" : "#6C6F85";
  const inputClass =
    "rounded-lg border border-ctp-surface2 bg-ctp-base px-3 py-3 font-inter-regular text-sm text-ctp-text";
  const chip = (active: boolean) =>
    `rounded-lg border px-3 py-2 ${
      active ? "border-ctp-blue bg-ctp-blue/10" : "border-ctp-surface1 bg-ctp-base"
    }`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end"
      >
        <Pressable
          onPress={close}
          disabled={saving}
          className="absolute inset-0 bg-black/50"
          accessibilityLabel="Close"
        />

        <View className="max-h-[92%] rounded-t-3xl bg-ctp-base px-5 pb-6 pt-3">
          <View className="mb-4 items-center">
            <View className="h-1.5 w-12 rounded-full bg-ctp-surface2" />
          </View>

          <Text className="font-inter-bold text-xl text-ctp-text">
            Void or Refund
          </Text>
          <Text className="mb-4 mt-1 font-inter-regular text-xs text-ctp-subtext0">
            {transactionCode} · The original receipt is kept. A supervisor must
            approve.
          </Text>

          <ScrollView
            style={{ flexGrow: 0, flexShrink: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"}
            showsVerticalScrollIndicator={false}
          >
            <View className="mb-4 flex-row gap-2">
              {(["void", "refund"] as const).map((value) => (
                <Pressable
                  key={value}
                  onPress={() => setKind(value)}
                  className={`flex-1 ${chip(kind === value)}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: kind === value }}
                >
                  <Text className="text-center font-inter-semibold text-sm text-ctp-text">
                    {value === "void" ? "Void (mistake)" : "Refund (return)"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
              Reason *
            </Text>
            <View className="mb-4 flex-row flex-wrap gap-2">
              {REVERSAL_REASONS.map((item) => (
                <Pressable
                  key={item.code}
                  onPress={() => {
                    setReason(item.code);
                    setError("");
                  }}
                  className={chip(reason === item.code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: reason === item.code }}
                >
                  <Text className="font-inter-regular text-xs text-ctp-text">
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={
                reason === "other" ? "Describe the reason *" : "Note (optional)"
              }
              placeholderTextColor={placeholderColor}
              maxLength={500}
              className={`mb-4 ${inputClass}`}
            />

            {kind === "refund" ? (
              <Pressable
                onPress={() => setReturnToStock((value) => !value)}
                className="mb-4 flex-row items-center gap-2"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: returnToStock }}
              >
                <View
                  className={`h-5 w-5 items-center justify-center rounded border ${
                    returnToStock
                      ? "border-ctp-blue bg-ctp-blue"
                      : "border-ctp-surface2"
                  }`}
                >
                  {returnToStock ? (
                    <Text className="text-xs text-ctp-crust">✓</Text>
                  ) : null}
                </View>
                <Text className="flex-1 font-inter-regular text-sm text-ctp-text">
                  Put the items back in stock
                </Text>
              </Pressable>
            ) : null}

            <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
              Supervisor *
            </Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Supervisor username"
              placeholderTextColor={placeholderColor}
              className={`mb-2 ${inputClass}`}
            />
            <TextInput
              value={pin}
              onChangeText={(value) => setPin(value.replace(/\D/g, "").slice(0, 6))}
              secureTextEntry
              keyboardType="number-pad"
              placeholder="6-digit PIN"
              placeholderTextColor={placeholderColor}
              className={`mb-3 ${inputClass}`}
            />

            {error ? (
              <Text className="mb-3 font-inter-regular text-xs leading-5 text-ctp-red">
                {error}
              </Text>
            ) : null}
          </ScrollView>

          <View className="mt-2 flex-row gap-2">
            <Pressable
              onPress={close}
              disabled={saving}
              className="flex-1 rounded-lg border border-ctp-surface1 bg-ctp-base px-4 py-3"
            >
              <Text className="text-center font-inter-semibold text-sm text-ctp-text">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={saving}
              accessibilityState={{ disabled: saving, busy: saving }}
              className="flex-1 rounded-lg border border-ctp-red bg-ctp-red px-4 py-3"
            >
              <Text className="text-center font-inter-semibold text-sm text-ctp-crust">
                {saving ? "Saving..." : kind === "void" ? "Void sale" : "Refund sale"}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
