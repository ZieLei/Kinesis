import { View, Dimensions, Text, Pressable, ScrollView, FlatList } from 'react-native';
import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Cart() {
  const router = useRouter();
  const { width: screenWidth } = Dimensions.get("window");
  const [fontsLoaded] = useFonts({
    FredokaOne: require("../../../assets/fonts/FredokaOne-Regular.ttf"),
    Inter: require("../../../assets/fonts/Inter-VariableFont_opsz,wght.ttf"),
  });

  if (!fontsLoaded) {
    return null;
  }
  return (
    <SafeAreaView className="flex-1">
      <View className="flex-1 pt-7 px-5 bg-[#F5F5F5]">
        <View className="flex-row justify-between items-center mb-5">
          <View className="h-5 w-5 bg-black/20" />
          <Text
            style={{
              fontFamily: "Inter",
              fontWeight: 600,
              fontSize: screenWidth * 0.045,
            }}>
            Cart
          </Text>
          <Text className="bg-black/5 py-1 px-2 rounded-md border-[1px] border-black/10"
            style={{
              fontFamily: "Inter",
              fontWeight: 600,
              fontSize: screenWidth * 0.04,
            }}
          >
            3
          </Text>
        </View>

        <FlatList className="flex-1"
          data={[{ name: "Brake Pads", price: 450 }]}
          renderItem={({ item }) => (
            <View className="flex-row my-3 bg-white py-[10px] px-3 rounded-[12px]"
              style={{
                boxShadow: '0px 0px 15px 1px rgba(0, 0, 0, 0.05)',
              }}
            >
              <View className="bg-black/10 h-20 w-20 rounded-lg" />
              <View className="pl-3">
                <Text
                  style={{
                    fontFamily: "Inter",
                    fontWeight: 500,
                    fontSize: screenWidth * 0.035,
                  }}>
                  {item.name}
                </Text>
                <Text className=""
                  style={{
                    fontFamily: "Inter",
                    fontWeight: 600,
                    fontSize: screenWidth * 0.035,
                  }}
                >
                  ₱ {item.price.toFixed(2)}
                </Text>

                <View className="flex-row bg-white items-center justify-between w-15 px-2 py-1 rounded-md border-[1px] border-black/5 mt-auto">
                  <Pressable className="h-5 w-5 items-center justify-center">
                    <Text
                      style={{
                        fontFamily: "Inter",
                        fontWeight: 600,
                        fontSize: screenWidth * 0.04,
                        transform: [{ translateY: -1 }],
                      }}>
                      −
                    </Text>
                  </Pressable>
                  <Text className="px-2"
                    style={{
                      fontFamily: "Inter",
                      fontWeight: 400,
                      fontSize: screenWidth * 0.04
                    }}>
                    1
                  </Text>
                  <Pressable className="h-5 w-5 items-center justify-center">
                    <Text
                      style={{
                        fontFamily: "Inter",
                        fontWeight: 600,
                        fontSize: screenWidth * 0.04,
                        transform: [{ translateY: -1 }],
                      }}>
                      +
                    </Text>
                  </Pressable>
                </View>

              </View>

              <View className="ml-auto flex-col">
                <Pressable className="bg-black/3 items-center justify-center w-6 h-6 ml-auto py-1 px-2 rounded-md border-[1px] border-black/10">
                  <Text className="text-black/70"
                    style={{
                      fontFamily: "Inter",
                      fontWeight: 500,
                      fontSize: screenWidth * 0.04,
                      transform: [{ translateY: -1 }],
                    }}
                  >
                    ×
                  </Text>
                </Pressable>
                <Text className="mt-auto"
                  style={{
                    fontFamily: "Inter",
                    fontWeight: 600,
                    fontSize: screenWidth * 0.035,
                  }}>
                  ₱ 450.00
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
          <Text
            style={{
              fontFamily: "Inter",
              fontWeight: 700,
              fontSize: screenWidth * 0.045,
            }}
          >
            Total:
          </Text>
          <Text
            style={{
              fontFamily: "Inter",
              fontWeight: 600,
              fontSize: screenWidth * 0.04,
            }}
          >
            ₱ 450.00
          </Text>

          <Pressable className="ml-auto bg-black">
            <Text className="text-white"
            >
              Checkout</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView >
  )
}
