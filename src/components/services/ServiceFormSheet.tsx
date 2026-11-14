import { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { BottomSheet, Host, RNHostView } from "@expo/ui";

import { useDismissOnBack } from "@/hooks/useDismissOnBack";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { Service, ServiceCreate } from "@/types/service";

// Same limits as the server (services_routes.ServiceCreate).
const NAME_MAX = 80;
const DESCRIPTION_MAX = 300;

type Props = {
  /** null creates a service; otherwise the service being edited. */
  service: Service | null;
  /** Shown only to supervisors editing an existing service. */
  onArchive?: () => void;
  onClose: () => void;
  onSubmit: (values: ServiceCreate) => Promise<void>;
};

/**
 * Add or edit a service. Mount it only while open so the form starts fresh
 * every time. Same bottom sheet as Add Product: opaque, themed, and the
 * handle drags it down to dismiss.
 */
export default function ServiceFormSheet({
  service,
  onArchive,
  onClose,
  onSubmit,
}: Props) {
  const { width, height } = useWindowDimensions();
  const { isDark, placeholder, selection, sheetBackground, onAccentSpinner } =
    useThemeColors();

  const editing = service !== null;

  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [price, setPrice] = useState(service ? service.price.toFixed(2) : "");
  const [cost, setCost] = useState(
    service?.estimated_cost != null ? String(service.estimated_cost) : "",
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (!saving) onClose();
  };

  useDismissOnBack(true, close);

  const formMaxHeight = Math.max(140, Math.round(height * 0.85) - 200);

  const submit = async () => {
    if (saving) return;

    const trimmedName = name.replace(/\s+/g, " ").trim();
    const trimmedPrice = price.trim();
    const trimmedCost = cost.trim();

    if (!trimmedName) return setError("Please enter a service name.");
    if (trimmedName.length > NAME_MAX)
      return setError(`Service names must be ${NAME_MAX} characters or fewer.`);
    if (description.trim().length > DESCRIPTION_MAX)
      return setError(`Descriptions must be ${DESCRIPTION_MAX} characters or fewer.`);

    if (!/^\d{1,7}(\.\d{1,2})?$/.test(trimmedPrice))
      return setError("Enter a price of 0 or more with up to two decimal places.");

    if (trimmedCost !== "" && !/^\d{1,7}(\.\d{1,4})?$/.test(trimmedCost))
      return setError("Estimated cost must be an amount with up to 4 decimal places, or left blank.");

    setError("");
    setSaving(true);

    try {
      await onSubmit({
        name: trimmedName,
        description: description.replace(/\s+/g, " ").trim(),
        price: Number(Number(trimmedPrice).toFixed(2)),
        estimated_cost: trimmedCost === "" ? null : Number(Number(trimmedCost).toFixed(4)),
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The service could not be saved. Please try again.",
      );
      setSaving(false);
    }
  };

  const inputClass =
    "rounded-lg border border-ctp-surface2 bg-ctp-base px-3 py-3 font-inter-regular text-sm text-ctp-text";

  return (
    <Host
      style={
        Platform.OS === "web"
          ? { position: "absolute", left: 0, top: 0, width: 0, height: 0 }
          : { position: "absolute", width }
      }
    >
      <BottomSheet
        isPresented
        onDismiss={close}
        containerColor={sheetBackground}
        contentPadding={0}
      >
        <RNHostView
          matchContents
          style={Platform.OS === "web" ? { width: "100%" } : undefined}
        >
          <View
            style={{ width: Platform.OS === "web" ? "100%" : width }}
            className="bg-ctp-base px-5 pb-6 pt-3"
          >
            <Text className="font-inter-bold text-xl text-ctp-text">
              {editing ? "Edit Service" : "New Service"}
            </Text>
            <Text className="mb-4 mt-1 font-inter-regular text-xs text-ctp-subtext0">
              {editing
                ? "Changes apply to new sales only. Past sales keep the price they were sold at."
                : "Set the fee and an optional estimated cost for margin reports."}
            </Text>

            <ScrollView
              style={{ maxHeight: formMaxHeight }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"}
              showsVerticalScrollIndicator={false}
            >
              <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
                Service name *
              </Text>
              <TextInput
                value={name}
                onChangeText={(value) => {
                  setName(value);
                  setError("");
                }}
                maxLength={NAME_MAX}
                placeholder="e.g. Engine Oil Change (Labor)"
                placeholderTextColor={placeholder}
                selectionColor={selection}
                editable={!saving}
                className={`mb-4 ${inputClass}`}
              />

              <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
                Description
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                maxLength={DESCRIPTION_MAX}
                multiline
                textAlignVertical="top"
                placeholder="What the service includes (optional)"
                placeholderTextColor={placeholder}
                selectionColor={selection}
                editable={!saving}
                className={`mb-4 min-h-20 ${inputClass}`}
              />

              <View className="mb-2 flex-row gap-3">
                <View className="min-w-0 flex-1">
                  <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
                    Price (₱) *
                  </Text>
                  <TextInput
                    value={price}
                    onChangeText={(value) => {
                      setPrice(value);
                      setError("");
                    }}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    placeholder="0.00"
                    placeholderTextColor={placeholder}
                    selectionColor={selection}
                    editable={!saving}
                    className={inputClass}
                  />
                </View>

                <View className="min-w-0 flex-1">
                  <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
                    Est. cost (₱)
                  </Text>
                  <TextInput
                    value={cost}
                    onChangeText={(value) => {
                      setCost(value);
                      setError("");
                    }}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    placeholder="Optional"
                    placeholderTextColor={placeholder}
                    selectionColor={selection}
                    editable={!saving}
                    className={inputClass}
                  />
                </View>
              </View>

              {error ? (
                <View className="mb-2 mt-2 rounded-lg bg-ctp-red/15 p-3">
                  <Text className="font-inter-medium text-sm text-ctp-red">
                    {error}
                  </Text>
                </View>
              ) : null}

              {editing && onArchive ? (
                <Pressable
                  onPress={onArchive}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Archive service"
                  className="mt-3 items-center rounded-lg border border-ctp-red/40 px-4 py-3"
                >
                  <Text className="font-inter-semibold text-sm text-ctp-red">
                    Archive service
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>

            <View className="mt-4 flex-row gap-3">
              <Pressable
                onPress={close}
                disabled={saving}
                className="flex-1 items-center justify-center rounded-lg border border-ctp-surface2 bg-ctp-mantle px-4 py-3"
              >
                <Text className="font-inter-semibold text-sm text-ctp-text">
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={() => void submit()}
                disabled={saving}
                accessibilityState={{ disabled: saving, busy: saving }}
                className={`flex-1 flex-row items-center justify-center rounded-lg px-4 py-3 ${saving ? "bg-ctp-blue/50" : "bg-ctp-blue"}`}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={onAccentSpinner} />
                ) : null}
                <Text
                  className={`font-inter-semibold text-sm ${isDark ? "text-ctp-crust" : "text-white"} ${saving ? "ml-2" : ""}`}
                >
                  {saving ? "Saving..." : editing ? "Save Changes" : "Create Service"}
                </Text>
              </Pressable>
            </View>
          </View>
        </RNHostView>
      </BottomSheet>
    </Host>
  );
}
