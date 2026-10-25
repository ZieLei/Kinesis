import { View, Text, Pressable, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCart } from '../app/context/CartContext';
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import { styledIcon } from "@/components/StyledIcon";

const StyledChevronLeft = styledIcon(ChevronLeft);

export default function Cart() {
  const router = useRouter();

  const {
    items,
    increaseQuantity,
    decreaseQuantity,
    removeFromCart,
    total,
  } = useCart();

  return (
    <SafeAreaView className="flex-1 bg-ctp-base">
      <View className="flex-1 px-5 pt-7">

        <View className="mb-5 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="h-5 w-5 items-center justify-center"
          >
            <StyledChevronLeft
              size={20}
              className="text-ctp-text"
            />
          </Pressable>

          <Text className="text-lg font-inter-semibold text-ctp-text">
            Cart
          </Text>

          <Text className="rounded-md border-[1px] border-ctp-surface0 bg-ctp-surface0/50 px-2 py-1 text-base font-inter-semibold text-ctp-text">
            {items.length}
          </Text>
        </View>

        <FlatList
          className="flex-1"
          data={items}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View
              className="my-2 flex-row rounded-[12px] bg-ctp-mantle px-3 py-[10px]"
              style={{
                boxShadow: '0px 0px 15px 1px rgba(0, 0, 0, 0.05)',
              }}
            >
              <View className="h-20 w-20 rounded-lg bg-ctp-surface0" />

              <View className="pl-3">
                <Text className="text-md font-inter-medium text-ctp-text">
                  {item.name}
                </Text>

                <Text className="text-sm font-inter-semibold text-ctp-subtext0">
                  ₱ {item.price.toLocaleString('en-PH', {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 2,
                  })}
                </Text>

                <View
                  className="mt-auto self-start flex-row items-center justify-between rounded-md border-[1px] border-ctp-surface0 bg-ctp-base px-2 py-1"
                  style={{ width: 90 }}
                >
                  <Pressable
                    className="h-5 w-5 items-center justify-center"
                    onPress={() => decreaseQuantity(item.id)}
                  >
                    <Text
                      className="text-base font-inter-semibold text-ctp-text"
                      style={{ transform: [{ translateY: -1 }] }}
                    >
                      −
                    </Text>
                  </Pressable>

                  <Text
                    className="text-base font-inter-regular text-ctp-text"
                    selectable={false}
                  >
                    {item.quantity}
                  </Text>

                  <Pressable
                    className="h-5 w-5 items-center justify-center"
                    onPress={() => increaseQuantity(item.id)}
                  >
                    <Text
                      className="text-base font-inter-semibold text-ctp-text"
                      selectable={false}
                      style={{ transform: [{ translateY: -1 }] }}
                    >
                      +
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View className="ml-auto flex-col">

                <Pressable
                  onPress={() => removeFromCart(item.id)}
                  className="ml-auto h-6 w-6 items-center justify-center rounded-md border-[1px] border-ctp-surface0 bg-ctp-surface0/30"
                >
                  <Text
                    className="text-base font-inter-medium text-ctp-subtext0"
                    style={{ transform: [{ translateY: -1 }] }}
                  >
                    ×
                  </Text>
                </Pressable>

                <Text className="mt-auto text-md font-inter-semibold text-ctp-text">
                  ₱ {(item.price * item.quantity).toLocaleString('en-PH', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Text>

              </View>
            </View>
          )}
        />

        <View
          className="-mx-5 flex-row items-center rounded-tl-lg rounded-tr-lg bg-ctp-mantle px-5 py-5"
          style={{
            boxShadow: '0px -4px 10px 1px rgba(0, 0, 0, 0.05)',
            zIndex: 0,
            elevation: 0,
          }}
        >
          <Text className="mr-1 text-lg font-inter-bold text-ctp-text">
            Total:
          </Text>

          <Text className="text-base font-inter-semibold text-ctp-text">
            ₱ {total.toLocaleString('en-PH', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>

          <Pressable className="ml-auto rounded-lg bg-ctp-blue px-2 py-2">
            <Text className="text-sm font-inter-semibold text-ctp-crust">
              Checkout
            </Text>
          </Pressable>
        </View>

      </View>
    </SafeAreaView>
  );
}
