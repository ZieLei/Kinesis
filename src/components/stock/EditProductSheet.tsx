import { useState } from "react";
import {
  ActivityIndicator,
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
import type { Product, ProductFormValues } from "@/types/product";

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

export default function EditProductSheet({
  product,
  visible,
  categories,
  onClose,
  onSave,
}: EditProductSheetProps) {
  const { width } = useWindowDimensions();
  const { isDark, placeholder, selection, onAccentSpinner, sheetBackground } =
    useThemeColors();

  const isPresented = visible || product !== null;
  const isCreating = visible && product === null;

  const form = useProductForm(product, isPresented);
  const [saving, setSaving] = useState(false);

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

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
    <Host style={{ position: "absolute", width }}>
      <BottomSheet
        isPresented={isPresented}
        onDismiss={handleClose}
        containerColor={sheetBackground}
      >
        <RNHostView matchContents>
          <View style={{ width }} className="bg-ctp-base px-5 pb-8 pt-5">
            <View className="mb-6 flex-row items-center justify-between">
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
              style={{ maxHeight: 590 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
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
              </View>

              <View className="mb-4 rounded-2xl border border-ctp-surface0 bg-ctp-mantle p-4">
                <Text className="font-inter-semibold text-lg text-ctp-text">
                  Inventory
                </Text>

                <Text className="mb-4 mt-1 font-inter-regular text-xs text-ctp-subtext0">
                  Set the quantity available in stock.
                </Text>

                <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
                  Stock Quantity
                </Text>

                <TextInput
                  value={form.stock}
                  onChangeText={form.changeStock}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={placeholder}
                  selectionColor={selection}
                  editable={!saving}
                  className="rounded-lg border border-ctp-surface2 bg-ctp-base px-3 py-3 font-inter-medium text-ctp-text"
                />

                <Text className="mt-2 font-inter-regular text-xs text-ctp-subtext0">
                  Set to 0 when the product is out of stock.
                </Text>
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
