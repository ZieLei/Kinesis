import { View, Text, Pressable, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCart } from '../context/CartContext';

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
    <SafeAreaView className="bg-[#F5F5F5] flex-1">
      <View className="flex-1 pt-7 px-5">

        <View className="flex-row justify-between items-center mb-5">
          <View className="h-5 w-5 bg-black/20" />

          <Text className="text-lg font-inter-semibold">
            Cart
          </Text>

          <Text
            className="bg-black/5 text-base py-1 px-2 rounded-md border-[1px] border-black/10 font-inter-semibold"
          >
            {items.length}
          </Text>
        </View>

        <FlatList
          className="flex-1"
          data={items}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View
              className="flex-row my-2 bg-white py-[10px] px-3 rounded-[12px]"
              style={{
                boxShadow: '0px 0px 15px 1px rgba(0, 0, 0, 0.05)',
              }}
            >
              <View className="bg-black/10 h-20 w-20 rounded-lg" />

              <View className="pl-3">
                <Text className="text-md font-inter-medium">
                  {item.name}
                </Text>

                <Text className="text-sm text-black/60 font-inter-semibold">
                  ₱ {item.price.toLocaleString('en-PH', {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 2,
                  })}
                </Text>

                <View className="flex-row bg-white items-center justify-between w-15 px-2 py-1 rounded-md border-[1px] border-black/5 mt-auto">

                  <Pressable
                    className="h-5 w-5 items-center justify-center"
                    onPress={() => decreaseQuantity(item.id)}
                  >
                    <Text
                      className="text-base font-inter-semibold"
                      style={{
                        transform: [{ translateY: -1 }],
                      }}
                    >
                      −
                    </Text>
                  </Pressable>

                  <Text
                    className="px-2 text-base font-inter-regular"
                    selectable={false}
                  >
                    {item.quantity}
                  </Text>

                  <Pressable
                    className="h-5 w-5 items-center justify-center"
                    onPress={() => increaseQuantity(item.id)}
                  >
                    <Text
                      className="text-base font-inter-semibold"
                      selectable={false}
                      style={{
                        transform: [{ translateY: -1 }],
                      }}
                    >
                      +
                    </Text>
                  </Pressable>

                </View>
              </View>

              <View className="ml-auto flex-col">

                <Pressable
                  onPress={() => removeFromCart(item.id)}
                  className="bg-black/3 items-center justify-center w-6 h-6 ml-auto py-1 px-2 rounded-md border-[1px] border-black/10"
                >
                  <Text
                    className="text-black/70 text-base font-inter-medium"
                    style={{
                      transform: [{ translateY: -1 }],
                    }}
                  >
                    ×
                  </Text>
                </Pressable>

                <Text className="mt-auto text-md text-black/80 font-inter-semibold">
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
          className="flex-row bg-white items-center -mx-5 py-5 px-5 rounded-tl-lg rounded-tr-lg"
          style={{
            boxShadow: '0px -4px 10px 1px rgba(0, 0, 0, 0.05)',
            zIndex: 0,
            elevation: 0,
          }}
        >
          <Text className="mr-1 text-lg text-black/90 font-inter-bold">
            Total:
          </Text>

          <Text className="text-base font-inter-semibold">
            ₱ {total.toLocaleString('en-PH', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>

          <Pressable className="ml-auto bg-black rounded-lg py-2 px-2">
            <Text className="text-white text-sm font-inter-semibold">
              Checkout
            </Text>
          </Pressable>
        </View>

      </View>
    </SafeAreaView>
  );
}
