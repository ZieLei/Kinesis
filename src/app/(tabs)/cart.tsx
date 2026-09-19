import { View, Text, Pressable, ScrollView, FlatList } from 'react-native';
import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import initialCart from "../../data/cart.json";
import { useState } from 'react';

export default function Cart() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    FredokaOne: require("../../../assets/fonts/FredokaOne-Regular.ttf"),
    Inter: require("../../../assets/fonts/Inter-VariableFont_opsz,wght.ttf"),
  });

  const [cart, setCart] = useState(initialCart);

  const totalPrice = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );


  if (!fontsLoaded) {
    return null;
  }
  return (
    <SafeAreaView className="flex-1">
      <View className="flex-1 pt-7 px-5 bg-[#F5F5F5]">
        <View className="flex-row justify-between items-center mb-5">
          <View className="h-5 w-5 bg-black/20" />
          <Text className="text-lg"
            style={{
              fontFamily: "Inter",
              fontWeight: 600,
            }}>
            Cart
          </Text>
          <Text className="bg-black/5 text-base py-1 px-2 rounded-md border-[1px] border-black/10"
            style={{
              fontFamily: "Inter",
              fontWeight: 600,
            }}
          >
            {cart.length}
          </Text>
        </View>

        <FlatList className="flex-1"
          data={cart}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View className="flex-row my-2 bg-white py-[10px] px-3 rounded-[12px]"
              style={{
                boxShadow: '0px 0px 15px 1px rgba(0, 0, 0, 0.05)',
              }}
            >
              <View className="bg-black/10 h-20 w-20 rounded-lg" />
              <View className="pl-3">
                <Text className="text-md"
                  style={{
                    fontFamily: "Inter",
                    fontWeight: 500,
                  }}>
                  {item.name}
                </Text>
                <Text className="text-sm text-black/60"
                  style={{
                    fontFamily: "Inter",
                    fontWeight: 600,
                  }}
                >
                  ₱ {(item.price).toLocaleString('en-PH', {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 2
                  })}
                </Text>

                <View className="flex-row bg-white items-center justify-between w-15 px-2 py-1 rounded-md border-[1px] border-black/5 mt-auto">
                  <Pressable className="h-5 w-5 items-center justify-center"
                    onPress={() => {
                      setCart(prev =>
                        prev.map(cartItem =>
                          cartItem.id === item.id
                            ? {
                              ...cartItem,
                              quantity: Math.max(1, cartItem.quantity - 1),
                            }
                            : cartItem
                        )
                      );
                    }}
                  >
                    <Text className="text-base"
                      style={{
                        fontFamily: "Inter",
                        fontWeight: 600,
                        transform: [{ translateY: -1 }],
                      }}>
                      −
                    </Text>
                  </Pressable>
                  <Text className="px-2 text-base"
                    selectable={false}
                    style={{
                      fontFamily: "Inter",
                      fontWeight: 400,
                    }}>
                    {item.quantity}
                  </Text>
                  <Pressable className="h-5 w-5 items-center justify-center"
                    onPress={() => {
                      setCart(prev =>
                        prev.map(cartItem =>
                          cartItem.id === item.id
                            ? { ...cartItem, quantity: cartItem.quantity + 1 }
                            : cartItem
                        )
                      );
                    }}
                  >
                    <Text className="text-base"
                      selectable={false}
                      style={{
                        fontFamily: "Inter",
                        fontWeight: 600,
                        transform: [{ translateY: -1 }],
                      }}>
                      +
                    </Text>
                  </Pressable>
                </View>

              </View>

              <View className="ml-auto flex-col">
                <Pressable className="bg-black/3 items-center justify-center w-6 h-6 ml-auto py-1 px-2 rounded-md border-[1px] border-black/10"
                >
                  <Text className="text-black/70 text-base"
                    style={{
                      fontFamily: "Inter",
                      fontWeight: 500,
                      transform: [{ translateY: -1 }],
                    }}
                  >
                    ×
                  </Text>
                </Pressable>
                <Text className="mt-auto text-md text-black/80"
                  style={{
                    fontFamily: "Inter",
                    fontWeight: 600,
                  }}>
                  ₱ {(item.price * item.quantity).toLocaleString('en-PH', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </Text>
              </View>
            </View>
          )}
        />

        <View className="flex-row bg-white items-center -mx-5 py-5 px-5 rounded-tl-lg rounded-tr-lg"
          style={{
            boxShadow: '0px -4x 10px 1px rgba(0, 0, 0, 0.5)',
            zIndex: 0,
            elevation: 0,
          }}
        >
          <Text className="mr-1 text-lg text-black/90"
            style={{
              fontFamily: "Inter",
              fontWeight: 700,
            }}
          >
            Total:
          </Text>
          <Text className="text-base"
            style={{
              fontFamily: "Inter",
              fontWeight: 600,
            }}
          >
            ₱ {(totalPrice).toLocaleString('en-PH', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </Text>

          <Pressable className="ml-auto bg-black rounded-lg py-2 px-2">
            <Text className="text-white text-sm 
            "
              style={{
                fontFamily: "Inter",
                fontWeight: 600,
              }}
            >
              Checkout</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView >
  )
}
