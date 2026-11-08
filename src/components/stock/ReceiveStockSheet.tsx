

import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { PackagePlus, X } from "lucide-react-native";

import type { Product } from "@/types/product";
import type { InventoryReceiptCreate } from "@/types/inventory";
import { useDismissOnBack } from "@/hooks/useDismissOnBack";

type ReceiveStockSheetProps = {
  visible: boolean;
  products: Product[];
  onClose: () => void;
  onReceive: (data: InventoryReceiptCreate) => Promise<void>;
};

const MAX_UNIT_COST = 99999999.9999;

function parseUnitCost(value: string): number | null {
  const trimmed = value.trim();

  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);

  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    parsed > MAX_UNIT_COST
  ) {
    return null;
  }

  return Number(parsed.toFixed(4));
}

function formatCurrency(value: number): string {
  return `₱${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
}

export default function ReceiveStockSheet({
  visible,
  products,
  onClose,
  onReceive,
}: ReceiveStockSheetProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    null,
  );
  const [productSearch, setProductSearch] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [openingStockUnitCost, setOpeningStockUnitCost] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();

    if (!query) return products.slice(0, 30);

    return products
      .filter(
        (product) =>
          product.name.toLowerCase().includes(query) ||
          product.sku?.toLowerCase().includes(query),
      )
      .slice(0, 30);
  }, [products, productSearch]);

  const needsOpeningCost =
    selectedProduct !== null &&
    selectedProduct.stock > 0 &&
    selectedProduct.average_cost === null;

  useEffect(() => {
    if (!visible) return;

    setSelectedProductId(products[0]?.id ?? null);
    setProductSearch("");
    setQuantity("1");
    setUnitCost("");
    setOpeningStockUnitCost("");
    setSupplierName("");
    setReferenceNumber("");
    setNotes("");
    setFormError("");
    setSaving(false);
  }, [visible, products]);

  const close = () => {
    if (saving) return;
    onClose();
  };

  // Android back / browser back closes this first (web; native handles it).
  useDismissOnBack(visible, close);

  const handleReceive = async () => {
    if (saving) return;

    if (!selectedProduct) {
      setFormError("Choose a product to receive.");
      return;
    }

    const parsedQuantity = Number(quantity);

    if (
      !/^\d+$/.test(quantity.trim()) ||
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity <= 0 ||
      parsedQuantity > 100000
    ) {
      setFormError("Quantity must be a whole number between 1 and 100,000.");
      return;
    }

    const parsedUnitCost = parseUnitCost(unitCost);

    if (parsedUnitCost === null) {
      setFormError(
        "Enter a valid purchase cost with up to 4 decimal places.",
      );
      return;
    }

    let parsedOpeningCost: number | undefined;

    if (needsOpeningCost) {
      const parsed = parseUnitCost(openingStockUnitCost);

      if (parsed === null) {
        setFormError(
          "Enter the estimated acquisition cost for the existing stock. This is needed to calculate its weighted average.",
        );
        return;
      }

      parsedOpeningCost = parsed;
    }

    setFormError("");
    setSaving(true);

    try {
      await onReceive({
        supplier_name: supplierName.trim() || null,
        reference_number: referenceNumber.trim() || null,
        notes: notes.trim() || null,
        items: [
          {
            product_id: selectedProduct.id,
            quantity: parsedQuantity,
            unit_cost: parsedUnitCost,
            ...(parsedOpeningCost !== undefined
              ? { opening_stock_unit_cost: parsedOpeningCost }
              : {}),
          },
        ],
      });

      onClose();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "The stock receipt could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  const mutedColor = isDark ? "#A6ADC8" : "#6C6F85";
  const textColor = isDark ? "#CDD6F4" : "#4C4F69";
  const placeholderColor = mutedColor;

  const inputClass =
    "rounded-lg border border-ctp-surface2 bg-ctp-base px-3 py-3 font-inter-regular text-sm text-ctp-text";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-end"
      >
        <Pressable
          onPress={close}
          disabled={saving}
          className="absolute inset-0 bg-black/50"
          accessibilityLabel="Close receive stock sheet"
        />

        <View className="max-h-[92%] rounded-t-3xl bg-ctp-base px-5 pb-8 pt-3">
          <View className="mb-5 items-center">
            <View className="h-1.5 w-12 rounded-full bg-ctp-surface2" />
          </View>

          <View className="mb-5 flex-row items-center justify-between">
            <View className="flex-1 flex-row items-center">
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-ctp-surface0">
                <PackagePlus size={21} color={textColor} />
              </View>

              <View className="flex-1">
                <Text className="font-inter-bold text-xl text-ctp-text">
                  Receive Stock
                </Text>

                <Text className="mt-1 font-inter-regular text-xs text-ctp-subtext0">
                  Record a purchase and update inventory cost.
                </Text>
              </View>
            </View>

            <Pressable
              onPress={close}
              disabled={saving}
              className="h-9 w-9 items-center justify-center rounded-lg bg-ctp-mantle"
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={19} color={textColor} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
              Product *
            </Text>

            <TextInput
              value={productSearch}
              onChangeText={setProductSearch}
              placeholder="Search by product name or SKU..."
              placeholderTextColor={placeholderColor}
              selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
              className={`mb-2 ${inputClass}`}
            />

            <View className="mb-4 max-h-36 rounded-lg border border-ctp-surface1 bg-ctp-mantle">
              <ScrollView nestedScrollEnabled>
                {filteredProducts.length > 0 ? (
                  filteredProducts.map((product) => {
                    const selected = product.id === selectedProductId;

                    return (
                      <Pressable
                        key={product.id}
                        onPress={() => {
                          setSelectedProductId(product.id);
                          setOpeningStockUnitCost("");
                          setFormError("");
                        }}
                        className={`border-b border-ctp-surface0 px-3 py-3 ${selected ? "bg-ctp-blue/10" : ""
                          }`}
                      >
                        <View className="flex-row items-center justify-between">
                          <View className="mr-3 flex-1">
                            <Text className="font-inter-semibold text-sm text-ctp-text">
                              {product.name}
                            </Text>

                            <Text className="mt-1 font-inter-regular text-xs text-ctp-subtext0">
                              {product.sku ?? "No SKU"} · {product.stock} in stock
                            </Text>
                          </View>

                          {selected ? (
                            <Text className="font-inter-semibold text-xs text-ctp-blue">
                              Selected
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })
                ) : (
                  <Text className="px-3 py-4 font-inter-regular text-xs text-ctp-subtext0">
                    No matching products found.
                  </Text>
                )}
              </ScrollView>
            </View>

            {selectedProduct ? (
              <View className="mb-4 rounded-lg border border-ctp-surface0 bg-ctp-mantle p-3">
                <Text className="font-inter-semibold text-sm text-ctp-text">
                  {selectedProduct.name}
                </Text>

                <View className="mt-2 flex-row justify-between">
                  <Text className="font-inter-regular text-xs text-ctp-subtext0">
                    Current stock
                  </Text>

                  <Text className="font-inter-semibold text-xs text-ctp-text">
                    {selectedProduct.stock} units
                  </Text>
                </View>

                <View className="mt-1 flex-row justify-between">
                  <Text className="font-inter-regular text-xs text-ctp-subtext0">
                    Current average cost
                  </Text>

                  <Text className="font-inter-semibold text-xs text-ctp-text">
                    {selectedProduct.average_cost === null
                      ? "Not recorded"
                      : formatCurrency(selectedProduct.average_cost)}
                  </Text>
                </View>
              </View>
            ) : null}

            <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
              Quantity Received *
            </Text>

            <TextInput
              value={quantity}
              onChangeText={(value) => {
                setQuantity(value);
                setFormError("");
              }}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={placeholderColor}
              selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
              className={`mb-4 ${inputClass}`}
            />

            <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
              Purchase Cost per Unit (₱) *
            </Text>

            <TextInput
              value={unitCost}
              onChangeText={(value) => {
                setUnitCost(value);
                setFormError("");
              }}
              keyboardType="decimal-pad"
              placeholder="e.g. 150.00"
              placeholderTextColor={placeholderColor}
              selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
              className={`mb-4 ${inputClass}`}
            />

            {needsOpeningCost ? (
              <View className="mb-4 rounded-lg border border-ctp-yellow/40 bg-ctp-yellow/10 p-3">
                <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
                  Cost of Existing Stock *
                </Text>

                <Text className="mb-3 font-inter-regular text-xs leading-5 text-ctp-subtext0">
                  This product already has {selectedProduct?.stock} units without a recorded cost. Enter your best available estimate of what those existing units cost per unit. This lets Kinesis calculate a meaningful weighted average.
                </Text>

                <TextInput
                  value={openingStockUnitCost}
                  onChangeText={(value) => {
                    setOpeningStockUnitCost(value);
                    setFormError("");
                  }}
                  keyboardType="decimal-pad"
                  placeholder="Estimated existing unit cost"
                  placeholderTextColor={placeholderColor}
                  selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
                  className={inputClass}
                />
              </View>
            ) : null}

            <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
              Supplier
            </Text>

            <TextInput
              value={supplierName}
              onChangeText={setSupplierName}
              placeholder="Supplier name (optional)"
              placeholderTextColor={placeholderColor}
              selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
              maxLength={150}
              className={`mb-4 ${inputClass}`}
            />

            <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
              Reference Number
            </Text>

            <TextInput
              value={referenceNumber}
              onChangeText={setReferenceNumber}
              placeholder="Invoice or receipt number (optional)"
              placeholderTextColor={placeholderColor}
              selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
              maxLength={80}
              className={`mb-4 ${inputClass}`}
            />

            <Text className="mb-2 font-inter-semibold text-sm text-ctp-text">
              Notes
            </Text>

            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Additional details (optional)"
              placeholderTextColor={placeholderColor}
              selectionColor={isDark ? "#89B4FA" : "#1E66F5"}
              multiline
              textAlignVertical="top"
              maxLength={500}
              className={`mb-4 min-h-20 ${inputClass}`}
            />

            {formError ? (
              <View className="mb-4 rounded-lg bg-ctp-red/15 p-3">
                <Text className="font-inter-medium text-sm text-ctp-red">
                  {formError}
                </Text>
              </View>
            ) : null}

            <View className="mb-2 flex-row gap-3">
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
                onPress={() => void handleReceive()}
                disabled={saving || products.length === 0}
                className={`flex-1 flex-row items-center justify-center rounded-lg px-4 py-3 ${saving || products.length === 0
                    ? "bg-ctp-blue/50"
                    : "bg-ctp-blue"
                  }`}
              >
                {saving ? (
                  <ActivityIndicator
                    size="small"
                    color={isDark ? "#11111B" : "#FFFFFF"}
                  />
                ) : (
                  <PackagePlus
                    size={17}
                    color={isDark ? "#11111B" : "#FFFFFF"}
                  />
                )}

                <Text className="ml-2 font-inter-semibold text-sm text-white">
                  {saving ? "Saving..." : "Receive Stock"}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
