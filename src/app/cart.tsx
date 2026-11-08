
import { View, Text, Pressable, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCart } from "@/app/context/CartContext";
import { usePOSFormatting } from "@/hooks/usePOSFormatting";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import { styledIcon } from "@/components/StyledIcon";
import { useBackNavigation } from "@/hooks/useBackNavigation";

const StyledChevronLeft = styledIcon(ChevronLeft);

export default function Cart() {
  // "/new-sale" is only the Up target for a screen opened with no history
  // (deep link / web refresh); normal back pops the real stack.
  const { goBack } = useBackNavigation("/new-sale");
  const router = useRouter();

  const {
    items,
    increaseQuantity,
    decreaseQuantity,
    removeFromCart,
    total,
    itemCount,
  } = useCart();

  const { formatCurrency } = usePOSFormatting();

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <View className="flex-1 px-5 pt-7">
        <View className="mb-5 flex-row items-center justify-between">
          <Pressable
            onPress={goBack}
            className="h-8 w-8 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <StyledChevronLeft size={20} className="text-ctp-text" />
          </Pressable>

          <Text className="text-lg font-inter-semibold text-ctp-text">
            Cart
          </Text>

          <Text className="rounded-md border border-ctp-surface0 bg-ctp-surface0/50 px-2 py-1 text-base font-inter-semibold text-ctp-text">
            {itemCount}
          </Text>
        </View>

        <FlatList
          className="flex-1"
          data={items}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: 16,
          }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center">
              <Text className="font-inter-semibold text-base text-ctp-text">
                Your cart is empty
              </Text>
              <Text className="mt-2 text-center font-inter-regular text-sm text-ctp-subtext0">
                Add products or services to start a sale.
              </Text>
              <Pressable
                onPress={() => router.dismissTo("/new-sale")}
                className="mt-5 rounded-lg bg-ctp-blue px-5 py-3"
              >
                <Text className="font-inter-semibold text-sm text-white">
                  Browse Products
                </Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <View
              className="my-2 flex-row rounded-xl bg-ctp-mantle px-3 py-3"
              style={{
                boxShadow: "0px 0px 15px 1px rgba(0, 0, 0, 0.05)",
              }}
            >
              <View className="h-20 w-16 items-center justify-center rounded-lg bg-ctp-surface0">
                <Text className="text-center text-[10px] font-inter-semibold text-ctp-subtext0">
                  {item.type === "service" ? "SERVICE" : "PART"}
                </Text>
              </View>

              <View className="ml-3 flex-1">
                <Text
                  numberOfLines={2}
                  className="font-inter-medium text-base text-ctp-text"
                >
                  {item.name}
                </Text>

                <Text className="mt-1 text-sm font-inter-semibold text-ctp-subtext0">
                  {formatCurrency(item.price)}
                </Text>

                {item.type === "service" && item.description ? (
                  <Text
                    numberOfLines={1}
                    className="mt-1 text-xs font-inter-regular text-ctp-subtext0"
                  >
                    {item.description}
                  </Text>
                ) : null}

                <View
                  className="mt-auto self-start flex-row items-center justify-between rounded-md border border-ctp-surface0 bg-ctp-base px-2 py-1"
                  style={{ width: 90 }}
                >
                  <Pressable
                    className="h-5 w-5 items-center justify-center"
                    onPress={() => decreaseQuantity(item.type, item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Decrease ${item.name} quantity`}
                  >
                    <Text className="text-base font-inter-semibold text-ctp-text">
                      −
                    </Text>
                  </Pressable>

                  <Text className="text-base font-inter-regular text-ctp-text">
                    {item.quantity}
                  </Text>

                  <Pressable
                    className="h-5 w-5 items-center justify-center"
                    onPress={() => increaseQuantity(item.type, item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Increase ${item.name} quantity`}
                  >
                    <Text className="text-base font-inter-semibold text-ctp-text">
                      +
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View className="ml-2 flex-col items-end">
                <Pressable
                  onPress={() => removeFromCart(item.type, item.id)}
                  className="h-6 w-6 items-center justify-center rounded-md border border-ctp-surface0 bg-ctp-surface0/30"
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.name}`}
                >
                  <Text className="text-base font-inter-medium text-ctp-subtext0">
                    ×
                  </Text>
                </Pressable>

                <Text className="mt-auto text-right text-sm font-inter-semibold text-ctp-text">
                  {formatCurrency(item.price * item.quantity)}
                </Text>
              </View>
            </View>
          )}
        />

        <View
          className="-mx-5 flex-row items-center rounded-tl-lg rounded-tr-lg bg-ctp-mantle px-5 py-5"
          style={{
            boxShadow: "0px -4px 10px 1px rgba(0, 0, 0, 0.05)",
          }}
        >
          <View>
            <Text className="text-sm font-inter-medium text-ctp-subtext0">
              Total
            </Text>
            <Text className="text-base font-inter-bold text-ctp-text">
              {formatCurrency(total)}
            </Text>
          </View>

          <Pressable
            onPress={() => router.push("/checkout")}
            disabled={items.length === 0}
            className={`ml-auto rounded-lg px-5 py-3 ${items.length === 0 ? "bg-ctp-blue/40" : "bg-ctp-blue"
              }`}
          >
            <Text className="text-sm font-inter-semibold text-white">
              Checkout
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
