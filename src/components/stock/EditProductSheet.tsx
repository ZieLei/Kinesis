
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

import ChevronLeft from "lucide-react-native/icons/chevron-left";

import CategorySelector from "@/components/stock/CategorySelector";
import PricingSection from "@/components/stock/PricingSelection";
import ProductImagePicker from "@/components/stock/ProductImagePicker";
import { styledIcon } from "@/components/StyledIcon";
import { useProductForm } from "@/hooks/useProductForm";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useTerminalSettings } from "@/app/context/TerminalSettingsContext";
import type { Product, ProductFormValues } from "@/types/product";
import { useDismissOnBack } from "@/hooks/useDismissOnBack";

const StyledChevronLeft = styledIcon(ChevronLeft);

type EditProductSheetProps = {
  product: Product | null;
  visible: boolean;
  categories: string[];
  onClose: () => void;
  onSave: (
    product: Product | null,
    values: ProductFormValues,
  ) => Promise<void>;
};

function createSkuPreview(
  settings: ReturnType<typeof useTerminalSettings>["settings"],
): string | null {
  if (!settings) return null;

  const prefix = settings.skuPrefix;
  const digits = Number(settings.skuDigits);
  const sequence = "#".repeat(digits);

  const year = settings.skuIncludeYear
    ? `${new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
    }).format(new Date())}-`
    : "";

  switch (settings.skuFormat) {
    case "prefix-sequence":
      return `${prefix}-${year}${sequence}`;

    case "sequence-only":
      return `${year}${sequence}`;

    case "prefix-part-sequence":
      return `${prefix}-${year}PART-${sequence}`;

    default:
      return null;
  }
}

function formatCurrency(value: number | null): string {
  if (value === null) return "Not recorded";

  return `₱${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
}

export default function EditProductSheet({
  product,
  visible,
  categories,
  onClose,
  onSave,
}: EditProductSheetProps) {
  const { width, height } = useWindowDimensions();

  // The form scrolls between a fixed header and pinned Save/Cancel actions.
  // Sized from the current window height, so when the keyboard opens (the
  // web app resizes its viewport for it) the form shrinks and the actions
  // stay visible above the keyboard instead of being pushed under it.
  const formMaxHeight = Math.max(140, Math.round(height * 0.85) - 190);

  const {
    isDark,
    placeholder,
    selection,
    onAccentSpinner,
    sheetBackground,
  } = useThemeColors();

  const { settings, status: settingsStatus } = useTerminalSettings();

  const isPresented = visible || product !== null;
  const isCreating = visible && product === null;

  const form = useProductForm(product, isPresented);

  const [saving, setSaving] = useState(false);

  const skuPreview = createSkuPreview(settings);

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  // Android back / browser back closes this first (web; native handles it).
  useDismissOnBack(isPresented, handleClose);

  const handleSave = async () => {
    if (!isPresented || saving) return;

    const values = form.validate();

    if (!values) return;

    setSaving(true);

    try {
      await onSave(product, values);
    } catch (error) {
      form.setFormError(
        error instanceof Error
          ? error.message
          : "Could not save the product. Check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Host
      style={
        Platform.OS === "web"
          ? // The web sheet is portalled to <body>, so this host is an empty
            // box. Sized to the window but starting inside the screen's 20px
            // padding, it stuck out 20px on the right; Android Chrome then
            // widened the whole page and the sheet with it (clipped content).
            { position: "absolute", left: 0, top: 0, width: 0, height: 0 }
          : { position: "absolute", width }
      }
    >
      <BottomSheet
        isPresented={isPresented}
        onDismiss={handleClose}
        containerColor={sheetBackground}
        // Full-bleed: the form's own px-5 is the only horizontal inset. The
        // web sheet otherwise adds 16px per side on top of a window-wide
        // form, which pushed the content right and cut off its right edge.
        contentPadding={0}
      >
        <RNHostView
          matchContents
          // On web matchContents is `width: fit-content`, which can't shrink
          // below the form's widest row: on phones narrower than ~360px the
          // form overflowed and clipped on the right. Pin it to the sheet.
          style={Platform.OS === "web" ? { width: "100%" } : undefined}
        >
          <View
            // Native sizes the sheet from its content, so it needs the
            // window width; on web the sheet already spans the window.
            style={{ width: Platform.OS === "web" ? "100%" : width }}
            className="bg-ctp-base px-5 pb-6 pt-3"
          >
            <View className="mb-4 flex-row items-center justify-between">
              <Pressable
                onPress={handleClose}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Close product form"
                className="h-9 w-9 items-center justify-center rounded-full bg-ctp-surface0"
              >
                <StyledChevronLeft size={20} className="text-ctp-text" />
              </Pressable>

              <Text className="font-inter-semibold text-lg text-ctp-text">
                {isCreating ? "Add Product" : "Edit Product"}
              </Text>

              <View className="h-9 w-9" />
            </View>

            <ScrollView
              style={{ maxHeight: formMaxHeight }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              <View className="mb-4 rounded-2xl border border-ctp-surface0 bg-ctp-mantle p-4">
                <View className="mb-4">
                  <Text className="font-inter-semibold text-lg text-ctp-text">
                    Product details
                  </Text>

                  <Text className="mt-1 font-inter-regular text-xs text-ctp-subtext0">
                    Enter the product details and optionally add an image.
                  </Text>
                </View>

                <ProductImagePicker
                  previewUri={form.imagePreviewUri}
                  disabled={saving}
                  onChoose={() => void form.chooseImage()}
                  onRemove={form.removeImage}
                  onPreviewError={form.handleImagePreviewError}
                />

                <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
                  Product Name
                </Text>

                <TextInput
                  value={form.name}
                  onChangeText={form.changeName}
                  placeholder="Enter product name"
                  placeholderTextColor={placeholder}
                  selectionColor={selection}
                  maxLength={150}
                  editable={!saving}
                  className="mb-4 rounded-lg border border-ctp-surface2 bg-ctp-base px-3 py-3 font-inter-medium text-ctp-text"
                />

                <CategorySelector
                  categories={categories}
                  selectedCategory={form.category}
                  showNewCategory={form.showNewCategory}
                  newCategory={form.newCategory}
                  onSelectCategory={form.selectCategory}
                  onToggleNewCategory={form.toggleNewCategory}
                  onChangeNewCategory={form.changeNewCategory}
                  onAddCategory={form.addCategory}
                />

                <View className="mt-5 rounded-xl border border-ctp-surface1 bg-ctp-base p-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="font-inter-semibold text-sm text-ctp-text">
                      Product SKU
                    </Text>

                    <Text className="font-inter-medium text-[10px] uppercase tracking-wide text-ctp-subtext0">
                      {isCreating ? "Automatic" : "Assigned"}
                    </Text>
                  </View>

                  <Text className="mt-2 font-inter-semibold text-base tracking-wider text-ctp-blue">
                    {isCreating
                      ? skuPreview ?? "Waiting for SKU configuration..."
                      : product?.sku ?? "No SKU assigned"}
                  </Text>

                  <Text className="mt-2 font-inter-regular text-xs leading-5 text-ctp-subtext0">
                    {isCreating
                      ? "The backend assigns the next available SKU when you create this product. The preview shows its configured format, not the actual sequence number."
                      : "The existing SKU is retained when editing this product."}
                  </Text>

                  {isCreating && settingsStatus !== "synced" && (
                    <Text className="mt-2 font-inter-medium text-[11px] text-ctp-yellow">
                      Using {settingsStatus === "offline" ? "cached" : "default"} SKU configuration.
                    </Text>
                  )}
                </View>
              </View>

              <View className="mb-4 rounded-2xl border border-ctp-surface0 bg-ctp-mantle p-4">
                <Text className="font-inter-semibold text-lg text-ctp-text">
                  Inventory
                </Text>

                {isCreating ? (
                  <>
                    <Text className="mb-4 mt-1 font-inter-regular text-xs text-ctp-subtext0">
                      Set the initial quantity and record its acquisition cost when known.
                    </Text>

                    <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
                      Initial Stock Quantity
                    </Text>

                    <TextInput
                      value={form.stock}
                      onChangeText={form.changeStock}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={placeholder}
                      selectionColor={selection}
                      editable={!saving}
                      className="mb-4 rounded-lg border border-ctp-surface2 bg-ctp-base px-3 py-3 font-inter-medium text-ctp-text"
                    />

                    <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
                      Purchase Cost per Unit (₱)
                    </Text>

                    <TextInput
                      value={form.initialUnitCost}
                      onChangeText={form.changeInitialUnitCost}
                      keyboardType="decimal-pad"
                      placeholder="e.g. 150.00"
                      placeholderTextColor={placeholder}
                      selectionColor={selection}
                      editable={!saving && Number(form.stock) > 0}
                      className={`rounded-lg border border-ctp-surface2 bg-ctp-base px-3 py-3 font-inter-medium text-ctp-text ${Number(form.stock) <= 0 ? "opacity-50" : ""
                        }`}
                    />

                    <Text className="mt-2 font-inter-regular text-xs leading-5 text-ctp-subtext0">
                      Optional. This is what the shop paid per unit, not its selling price. Leave blank when the acquisition cost is unknown. Enter an initial stock quantity above zero to record this cost.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text className="mb-4 mt-1 font-inter-regular text-xs text-ctp-subtext0">
                      Stock quantities and acquisition costs are managed through inventory receiving.
                    </Text>

                    <View className="mb-3 rounded-lg border border-ctp-surface2 bg-ctp-base p-3">
                      <Text className="font-inter-medium text-xs text-ctp-subtext0">
                        Current Stock
                      </Text>

                      <Text className="mt-1 font-inter-semibold text-lg text-ctp-text">
                        {product?.stock ?? 0} units
                      </Text>
                    </View>

                    <View className="rounded-lg border border-ctp-surface2 bg-ctp-base p-3">
                      <Text className="font-inter-medium text-xs text-ctp-subtext0">
                        Average Acquisition Cost per Unit
                      </Text>

                      <Text className="mt-1 font-inter-semibold text-lg text-ctp-text">
                        {formatCurrency(product?.average_cost ?? null)}
                      </Text>

                      {product?.average_cost == null && (product?.stock ?? 0) > 0 ? (
                        <Text className="mt-2 font-inter-regular text-xs leading-5 text-ctp-subtext0">
                          This product has stock with an unknown cost. You can enter an estimated cost for existing stock when recording its next receipt.
                        </Text>
                      ) : null}
                    </View>
                  </>
                )}
              </View>

              <PricingSection
                price={form.price}
                customPercent={form.customPercent}
                onChangePrice={form.changePrice}
                onChangeCustomPercent={form.changeCustomPercent}
                onApplyPercentage={form.applyPricePercentage}
                onApplyCustomPercentage={form.applyCustomPercentage}
              />

              {form.formError ? (
                <View className="mb-4 rounded-xl bg-ctp-red/15 p-3">
                  <Text className="font-inter-medium text-sm text-ctp-red">
                    {form.formError}
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            <View className="mt-4 flex-row gap-3">
              <Pressable
                onPress={handleClose}
                disabled={saving}
                className="flex-1 rounded-xl border border-ctp-surface2 bg-ctp-mantle p-4"
              >
                <Text className="text-center font-inter-semibold text-ctp-text">
                  Cancel
                </Text>
              </Pressable>

              <Pressable
                onPress={() => void handleSave()}
                disabled={saving}
                className="flex-1 flex-row items-center justify-center rounded-xl bg-ctp-blue p-4"
              >
                {saving ? (
                  <ActivityIndicator size="small" color={onAccentSpinner} />
                ) : (
                  <Text
                    className={`font-inter-semibold ${isDark ? "text-ctp-crust" : "text-white"
                      }`}
                  >
                    {isCreating ? "Create Product" : "Save Changes"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </RNHostView>
      </BottomSheet>
    </Host>
  );
}
