import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import Trash from "lucide-react-native/icons/trash";

import { styledIcon } from "@/components/StyledIcon";
import { usePOSFormatting } from "@/hooks/usePOSFormatting";
import type { ProductMatch } from "@/lib/counterScanner/types";
import type { Product } from "@/types/product";

const TrashIcon = styledIcon(Trash);

/** One row of scan results the cashier can still change. */
export type ScanLine = {
  key: string;
  productId: number;
  quantity: number;
  /** Other plausible products from the detector, most likely first. */
  alternates: ProductMatch[];
};

const MAX_QUANTITY = 999;
const SEARCH_RESULT_LIMIT = 6;

/** How many of a product can still be sold, given what is already in the cart. */
export function availableQuantity(
  product: Product,
  inCart: number,
  allowNegativeInventory: boolean,
) {
  return allowNegativeInventory
    ? MAX_QUANTITY
    : Math.max(0, product.stock - inCart);
}

type Props = {
  lines: ScanLine[];
  inventory: readonly Product[];
  /** Quantity of each product already in the cart, by product id. */
  cartQuantities: ReadonlyMap<number, number>;
  allowNegativeInventory: boolean;
  onChangeLine: (key: string, update: Partial<ScanLine>) => void;
  onRemoveLine: (key: string) => void;
  /** Called with only what can actually be sold (stock limits applied). */
  onConfirm: (additions: { product: Product; quantity: number }[]) => void;
};

export default function CounterScannerResults({
  lines,
  inventory,
  cartQuantities,
  allowNegativeInventory,
  onChangeLine,
  onRemoveLine,
  onConfirm,
}: Props) {
  const { formatCurrency } = usePOSFormatting();
  const [pickingKey, setPickingKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const productsById = useMemo(
    () => new Map(inventory.map((product) => [product.id, product])),
    [inventory],
  );

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];

    return inventory
      .filter(
        (product) =>
          product.name.toLowerCase().includes(query) ||
          (product.sku ?? "").toLowerCase().includes(query),
      )
      .slice(0, SEARCH_RESULT_LIMIT);
  }, [inventory, search]);

  // A product can appear on several rows after the cashier edits them, so the
  // stock check counts the cart plus every row for the same product.
  const sellable = useMemo(() => {
    const remaining = new Map<number, number>();
    const result = new Map<string, number>();

    for (const line of lines) {
      const product = productsById.get(line.productId);
      if (!product) {
        result.set(line.key, 0);
        continue;
      }

      const left =
        remaining.get(product.id) ??
        availableQuantity(
          product,
          cartQuantities.get(product.id) ?? 0,
          allowNegativeInventory,
        );
      const take = Math.min(line.quantity, left);

      remaining.set(product.id, left - take);
      result.set(line.key, take);
    }

    return result;
  }, [allowNegativeInventory, cartQuantities, lines, productsById]);

  const totalToAdd = lines.reduce(
    (sum, line) => sum + (sellable.get(line.key) ?? 0),
    0,
  );

  const confirm = () => {
    const additions: { product: Product; quantity: number }[] = [];

    for (const line of lines) {
      const product = productsById.get(line.productId);
      const quantity = sellable.get(line.key) ?? 0;
      if (product && quantity > 0) additions.push({ product, quantity });
    }

    onConfirm(additions);
  };

  const choose = (key: string, productId: number) => {
    onChangeLine(key, { productId });
    setPickingKey(null);
    setSearch("");
  };

  return (
    <View>
      {lines.map((line) => {
        const product = productsById.get(line.productId);
        const canSell = sellable.get(line.key) ?? 0;
        const picking = pickingKey === line.key;

        const alternateProducts = line.alternates
          .map((match) => productsById.get(match.productId))
          .filter(
            (candidate): candidate is Product =>
              candidate !== undefined && candidate.id !== line.productId,
          );

        return (
          <View
            key={line.key}
            className="my-2 rounded-xl border border-ctp-surface0 bg-ctp-mantle p-3"
          >
            <View className="flex-row items-start">
              <View className="min-w-0 flex-1">
                <Text
                  numberOfLines={2}
                  className="font-inter-medium text-base text-ctp-text"
                >
                  {product?.name ?? "Product no longer available"}
                </Text>

                {product ? (
                  <Text className="mt-0.5 font-inter-regular text-xs text-ctp-subtext0">
                    {product.sku ? `SKU: ${product.sku} · ` : ""}
                    {formatCurrency(product.price)}
                  </Text>
                ) : null}

                {product && canSell < line.quantity ? (
                  <Text className="mt-1 font-inter-medium text-xs text-ctp-red">
                    {canSell === 0
                      ? "None left to sell"
                      : `Only ${canSell} can be added`}
                  </Text>
                ) : null}
              </View>

              <Pressable
                onPress={() => onRemoveLine(line.key)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${product?.name ?? "item"} from results`}
                className="ml-2 h-8 w-8 items-center justify-center"
              >
                <TrashIcon size={18} className="text-ctp-red" />
              </Pressable>
            </View>

            <View className="mt-3 flex-row flex-wrap items-center gap-2">
              <View className="flex-row items-center rounded-lg border border-ctp-surface2 bg-ctp-base">
                <Pressable
                  onPress={() =>
                    onChangeLine(line.key, {
                      quantity: Math.max(1, line.quantity - 1),
                    })
                  }
                  disabled={line.quantity <= 1}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease quantity"
                  className="h-11 w-11 items-center justify-center disabled:opacity-40"
                >
                  <Text className="font-inter-medium text-xl text-ctp-text">
                    −
                  </Text>
                </Pressable>

                <Text className="min-w-8 text-center font-inter-semibold text-base text-ctp-text">
                  {line.quantity}
                </Text>

                <Pressable
                  onPress={() =>
                    onChangeLine(line.key, {
                      quantity: Math.min(MAX_QUANTITY, line.quantity + 1),
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Increase quantity"
                  className="h-11 w-11 items-center justify-center"
                >
                  <Text className="font-inter-medium text-xl text-ctp-text">
                    +
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => {
                  setPickingKey(picking ? null : line.key);
                  setSearch("");
                }}
                accessibilityRole="button"
                accessibilityLabel="Change product"
                className="min-h-11 items-center justify-center rounded-lg border border-ctp-surface2 px-4"
              >
                <Text className="font-inter-medium text-sm text-ctp-text">
                  {picking ? "Cancel" : "Change product"}
                </Text>
              </Pressable>
            </View>

            {picking ? (
              <View className="mt-3">
                {alternateProducts.length > 0 ? (
                  <View className="mb-2">
                    <Text className="mb-1 font-inter-medium text-xs text-ctp-subtext0">
                      Other possible matches
                    </Text>
                    {alternateProducts.map((candidate) => (
                      <ProductOption
                        key={candidate.id}
                        product={candidate}
                        onPress={() => choose(line.key, candidate.id)}
                      />
                    ))}
                  </View>
                ) : null}

                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search by name or SKU"
                  placeholderTextColor="#6c7086"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="min-h-11 rounded-lg border border-ctp-surface1 bg-ctp-base px-3 font-inter-regular text-sm text-ctp-text"
                />

                {matches.map((candidate) => (
                  <ProductOption
                    key={candidate.id}
                    product={candidate}
                    onPress={() => choose(line.key, candidate.id)}
                  />
                ))}

                {search.trim() && matches.length === 0 ? (
                  <Text className="mt-2 font-inter-regular text-xs text-ctp-subtext0">
                    {`No products match "${search.trim()}".`}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

      <Pressable
        onPress={confirm}
        disabled={totalToAdd === 0}
        accessibilityRole="button"
        className="mt-2 min-h-12 items-center justify-center rounded-lg bg-ctp-blue px-4 disabled:opacity-50"
      >
        <Text className="font-inter-semibold text-sm text-ctp-crust">
          {totalToAdd === 0
            ? "Nothing to add"
            : `Add ${totalToAdd} ${totalToAdd === 1 ? "item" : "items"} to sale`}
        </Text>
      </Pressable>
    </View>
  );
}

function ProductOption({
  product,
  onPress,
}: {
  product: Product;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Use ${product.name}`}
      className="mt-1 min-h-11 justify-center rounded-lg bg-ctp-base px-3 py-2"
    >
      <Text
        numberOfLines={1}
        className="font-inter-medium text-sm text-ctp-text"
      >
        {product.name}
      </Text>
      {product.sku ? (
        <Text
          numberOfLines={1}
          className="font-inter-regular text-xs text-ctp-subtext0"
        >
          SKU: {product.sku}
        </Text>
      ) : null}
    </Pressable>
  );
}
